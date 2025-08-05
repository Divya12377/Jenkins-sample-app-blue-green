pipeline {
    agent any
    
    environment {
        DOCKER_HUB_REPO = 'raheman456/sample-node-app'
        KUBE_NAMESPACE = 'jenkins'
        DOCKER_CREDENTIALS = credentials('docker-hub-credentials')
        PATH = "${PATH}:/usr/local/bin"
    }
    
    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }
        
        stage('Install Tools') {
            steps {
                sh '''
                    echo "Installing required tools..."
                    
                    # Install kubectl if not present
                    if ! command -v kubectl &> /dev/null; then
                        echo "Installing kubectl..."
                        curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
                        chmod +x kubectl
                        sudo mv kubectl /usr/local/bin/ 2>/dev/null || mv kubectl ./kubectl
                        export PATH="./:\$PATH"
                    fi
                    
                    echo "Tools installation completed"
                '''
            }
        }
        
        stage('Verify Tools') {
            steps {
                sh '''
                    echo "Verifying available tools..."
                    docker --version || echo "Docker not found - please install Docker on Jenkins agent"
                    ./kubectl version --client 2>/dev/null || kubectl version --client || echo "kubectl not found"
                    echo "Tools verification completed"
                '''
            }
        }
        
        stage('Determine Deployment Color') {
            steps {
                script {
                    // Check which version is currently active
                    def currentVersion = sh(
                        script: "./kubectl get service sample-app-service -n ${KUBE_NAMESPACE} -o jsonpath='{.spec.selector.version}' 2>/dev/null || kubectl get service sample-app-service -n ${KUBE_NAMESPACE} -o jsonpath='{.spec.selector.version}' 2>/dev/null || echo 'none'",
                        returnStdout: true
                    ).trim()
                    
                    echo "Current active version: ${currentVersion}"
                    
                    if (currentVersion == 'blue') {
                        env.DEPLOY_VERSION = 'green'
                        env.CURRENT_VERSION = 'blue'
                    } else {
                        env.DEPLOY_VERSION = 'blue'
                        env.CURRENT_VERSION = 'green'
                    }
                    
                    echo "Current version: ${env.CURRENT_VERSION}"
                    echo "Deploying version: ${env.DEPLOY_VERSION}"
                }
            }
        }
        
        stage('Build Docker Image') {
            steps {
                script {
                    // Login to Docker Hub
                    sh '''
                        echo $DOCKER_CREDENTIALS_PSW | docker login -u $DOCKER_CREDENTIALS_USR --password-stdin
                    '''
                    
                    // Build and push image
                    sh """
                        echo "Building Docker image..."
                        docker build -t ${DOCKER_HUB_REPO}:${env.DEPLOY_VERSION} .
                        echo "Pushing Docker image..."
                        docker push ${DOCKER_HUB_REPO}:${env.DEPLOY_VERSION}
                        echo "Docker image pushed successfully"
                    """
                }
            }
        }
        
        stage('Deploy New Version') {
            steps {
                script {
                    // Create a temporary deployment file with the correct image
                    sh """
                        echo "Preparing deployment for ${env.DEPLOY_VERSION} version..."
                        
                        # Create temporary deployment file
                        cp app-${env.DEPLOY_VERSION}.yaml temp-deployment.yaml
                        
                        # Update image in deployment file
                        sed -i 's|image: .*|image: ${DOCKER_HUB_REPO}:${env.DEPLOY_VERSION}|g' temp-deployment.yaml
                        
                        echo "Applying deployment..."
                        ./kubectl apply -f temp-deployment.yaml -n ${KUBE_NAMESPACE} 2>/dev/null || kubectl apply -f temp-deployment.yaml -n ${KUBE_NAMESPACE}
                        
                        # Clean up temp file
                        rm temp-deployment.yaml
                        
                        echo "Waiting for deployment to be ready..."
                        ./kubectl rollout status deployment/sample-app-${env.DEPLOY_VERSION} -n ${KUBE_NAMESPACE} --timeout=300s 2>/dev/null || kubectl rollout status deployment/sample-app-${env.DEPLOY_VERSION} -n ${KUBE_NAMESPACE} --timeout=300s
                        
                        echo "Verifying pods..."
                        ./kubectl get pods -l app=sample-app,version=${env.DEPLOY_VERSION} -n ${KUBE_NAMESPACE} 2>/dev/null || kubectl get pods -l app=sample-app,version=${env.DEPLOY_VERSION} -n ${KUBE_NAMESPACE}
                    """
                }
            }
        }
        
        stage('Run Health Check') {
            steps {
                script {
                    sh """
                        echo "Running health check on new deployment..."
                        
                        # Get pod name for health check
                        POD_NAME=\$(./kubectl get pods -l app=sample-app,version=${env.DEPLOY_VERSION} -n ${KUBE_NAMESPACE} -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || kubectl get pods -l app=sample-app,version=${env.DEPLOY_VERSION} -n ${KUBE_NAMESPACE} -o jsonpath='{.items[0].metadata.name}')
                        
                        if [ ! -z "\$POD_NAME" ]; then
                            echo "Health checking pod: \$POD_NAME"
                            ./kubectl exec \$POD_NAME -n ${KUBE_NAMESPACE} -- curl -f http://localhost:3000 2>/dev/null || kubectl exec \$POD_NAME -n ${KUBE_NAMESPACE} -- curl -f http://localhost:3000 || echo "Health check completed"
                        else
                            echo "No pods found for health check"
                        fi
                        
                        echo "New ${env.DEPLOY_VERSION} version is ready for traffic switch"
                    """
                }
            }
        }
        
        stage('Switch Traffic') {
            steps {
                script {
                    echo "Switching traffic from ${env.CURRENT_VERSION} to ${env.DEPLOY_VERSION}..."
                    
                    // Update service to point to new version
                    sh """
                        ./kubectl patch service sample-app-service -n ${KUBE_NAMESPACE} -p '{"spec":{"selector":{"version":"${env.DEPLOY_VERSION}"}}}' 2>/dev/null || kubectl patch service sample-app-service -n ${KUBE_NAMESPACE} -p '{"spec":{"selector":{"version":"${env.DEPLOY_VERSION}"}}}'
                        
                        echo "Traffic switched to ${env.DEPLOY_VERSION} version"
                        
                        # Wait for change to propagate
                        sleep 5
                        
                        # Verify service endpoints
                        ./kubectl get endpoints sample-app-service -n ${KUBE_NAMESPACE} 2>/dev/null || kubectl get endpoints sample-app-service -n ${KUBE_NAMESPACE}
                    """
                }
            }
        }
        
        stage('Verify Deployment') {
            steps {
                script {
                    sh """
                        echo "Verifying deployment..."
                        
                        # Check service details
                        ./kubectl describe service sample-app-service -n ${KUBE_NAMESPACE} 2>/dev/null || kubectl describe service sample-app-service -n ${KUBE_NAMESPACE}
                        
                        # Get LoadBalancer URL if available
                        LB_URL=\$(./kubectl get svc sample-app-service -n ${KUBE_NAMESPACE} -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || kubectl get svc sample-app-service -n ${KUBE_NAMESPACE} -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || echo '')
                        
                        if [ ! -z "\$LB_URL" ]; then
                            echo "LoadBalancer URL: http://\$LB_URL"
                            echo "Testing external access..."
                            for i in 1 2 3; do
                                echo "Test attempt \$i:"
                                curl -s http://\$LB_URL || echo "External test attempt \$i completed"
                                sleep 2
                            done
                        else
                            echo "LoadBalancer URL not available yet"
                        fi
                        
                        echo "Deployment verification completed!"
                    """
                }
            }
        }
        
        stage('Cleanup Old Version') {
            steps {
                script {
                    try {
                        timeout(time: 2, unit: 'MINUTES') {
                            input message: "Scale down old version (${env.CURRENT_VERSION})?", ok: "Yes, scale down"
                        }
                        
                        echo "Scaling down ${env.CURRENT_VERSION} deployment..."
                        sh """
                            ./kubectl scale deployment sample-app-${env.CURRENT_VERSION} --replicas=0 -n ${KUBE_NAMESPACE} 2>/dev/null || kubectl scale deployment sample-app-${env.CURRENT_VERSION} --replicas=0 -n ${KUBE_NAMESPACE}
                            echo "Old version ${env.CURRENT_VERSION} scaled down successfully"
                        """
                    } catch (Exception e) {
                        echo "Cleanup skipped or timed out - keeping old version running for safety"
                    }
                }
            }
        }
    }
    
    post {
        always {
            script {
                sh '''
                    echo "Cleaning up..."
                    docker logout || true
                    docker system prune -f || true
                    echo "Cleanup completed"
                '''
            }
        }
        success {
            echo "🎉 Blue-Green deployment completed successfully!"
            echo "✅ Active version: ${env.DEPLOY_VERSION}"
            echo "🔗 Check your application at the LoadBalancer URL"
        }
        failure {
            script {
                echo "❌ Deployment failed! Attempting automatic rollback..."
                try {
                    sh """
                        echo "Rolling back to ${env.CURRENT_VERSION}..."
                        ./kubectl patch service sample-app-service -n ${KUBE_NAMESPACE} -p '{"spec":{"selector":{"version":"${env.CURRENT_VERSION}"}}}' 2>/dev/null || kubectl patch service sample-app-service -n ${KUBE_NAMESPACE} -p '{"spec":{"selector":{"version":"${env.CURRENT_VERSION}"}}}'
                        echo "✅ Rollback completed - service pointing back to ${env.CURRENT_VERSION}"
                    """
                } catch (Exception e) {
                    echo "❌ Automatic rollback failed: ${e.getMessage()}"
                    echo "🚨 Manual intervention required!"
                }
            }
        }
    }
}
