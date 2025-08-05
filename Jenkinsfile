pipeline {
    agent any
    
    environment {
        DOCKER_HUB_REPO = 'raheman456/sample-node-app'
        KUBE_NAMESPACE = 'jenkins'
        PATH = "$PATH:/usr/local/bin:$WORKSPACE/bin"
    }
    
    stages {
        stage('Verify Environment') {
            steps {
                script {
                    // Check for Docker
                    env.DOCKER_AVAILABLE = sh(
                        script: 'command -v docker',
                        returnStatus: true
                    ) == 0
                    
                    if (!env.DOCKER_AVAILABLE.toBoolean()) {
                        error("Docker not found on this agent. Please use an agent with Docker installed.")
                    }
                    
                    // Install kubectl if not available
                    if (sh(script: 'command -v kubectl', returnStatus: true) != 0) {
                        sh '''
                            echo "Installing kubectl..."
                            curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
                            chmod +x kubectl
                            mkdir -p $WORKSPACE/bin
                            mv kubectl $WORKSPACE/bin/
                        '''
                    }
                    
                    sh '''
                        echo "Environment verification:"
                        docker --version
                        kubectl version --client
                    '''
                }
            }
        }
        
        stage('Checkout') {
            steps {
                checkout scm
            }
        }
        
        stage('Determine Deployment Color') {
            steps {
                script {
                    def currentVersion = sh(
                        script: "kubectl get service sample-app-service -n $KUBE_NAMESPACE -o jsonpath='{.spec.selector.version}' 2>/dev/null || echo 'none'",
                        returnStdout: true
                    ).trim()
                    
                    if (currentVersion == 'blue') {
                        env.DEPLOY_VERSION = 'green'
                        env.DEPLOY_FILE = 'app-green.yaml'
                        env.CURRENT_VERSION = 'blue'
                    } else {
                        env.DEPLOY_VERSION = 'blue'
                        env.DEPLOY_FILE = 'app-blue.yaml'
                        env.CURRENT_VERSION = currentVersion == 'green' ? 'green' : 'none'
                    }
                    
                    echo "Current version: ${env.CURRENT_VERSION}"
                    echo "Deploying version: ${env.DEPLOY_VERSION}"
                    echo "Using deployment file: ${env.DEPLOY_FILE}"
                }
            }
        }
        
        stage('Build and Push Image') {
            steps {
                script {
                    withCredentials([usernamePassword(
                        credentialsId: 'docker-hub-credentials',
                        usernameVariable: 'DOCKER_USER',
                        passwordVariable: 'DOCKER_PASS'
                    )]) {
                        sh """
                            echo "Logging in to Docker Hub..."
                            echo \$DOCKER_PASS | docker login -u \$DOCKER_USER --password-stdin
                            
                            echo "Building Docker image..."
                            docker build -t $DOCKER_HUB_REPO:$DEPLOY_VERSION ./app
                            
                            echo "Pushing image to registry..."
                            docker push $DOCKER_HUB_REPO:$DEPLOY_VERSION
                            
                            docker logout
                        """
                    }
                }
            }
        }
        
        stage('Deploy New Version') {
            steps {
                script {
                    sh """
                        echo "Deploying $DEPLOY_VERSION version using $DEPLOY_FILE..."
                        sed "s|{{IMAGE}}|$DOCKER_HUB_REPO:$DEPLOY_VERSION|g" ./app/$DEPLOY_FILE > temp-deploy.yaml
                        kubectl apply -f temp-deploy.yaml -n $KUBE_NAMESPACE
                        kubectl apply -f ./app/app-service.yaml -n $KUBE_NAMESPACE
                        rm temp-deploy.yaml
                        
                        echo "Waiting for deployment to be ready..."
                        kubectl rollout status deployment/sample-app-$DEPLOY_VERSION -n $KUBE_NAMESPACE --timeout=300s
                    """
                }
            }
        }
        
        stage('Verify Deployment') {
            steps {
                script {
                    sh """
                        echo "Verifying deployment health..."
                        POD_NAME=\$(kubectl get pod -n $KUBE_NAMESPACE -l app=sample-app,version=$DEPLOY_VERSION -o jsonpath='{.items[0].metadata.name}')
                        kubectl exec \$POD_NAME -n $KUBE_NAMESPACE -- curl -s http://localhost:3000/health
                        
                        echo "Verifying service endpoints..."
                        kubectl get endpoints sample-app-service -n $KUBE_NAMESPACE
                    """
                }
            }
        }
        
        stage('Switch Traffic') {
            steps {
                script {
                    sh """
                        echo "Switching traffic to $DEPLOY_VERSION..."
                        kubectl patch service sample-app-service -n $KUBE_NAMESPACE -p '{"spec":{"selector":{"version":"$DEPLOY_VERSION"}}}'
                        
                        echo "Traffic switched successfully"
                        sleep 5  # Allow time for changes to propagate
                    """
                }
            }
        }
        
        stage('Cleanup Old Version') {
            when {
                expression { env.CURRENT_VERSION != null && env.CURRENT_VERSION != 'none' }
            }
            steps {
                script {
                    try {
                        timeout(time: 2, unit: 'MINUTES') {
                            input message: "Scale down old version ($CURRENT_VERSION)?", ok: "Confirm"
                        }
                        sh """
                            kubectl scale deployment sample-app-$CURRENT_VERSION --replicas=0 -n $KUBE_NAMESPACE
                            echo "Old version $CURRENT_VERSION scaled down"
                        """
                    } catch(err) {
                        echo "Skipping old version cleanup"
                    }
                }
            }
        }
    }
    
    post {
        always {
            sh '''
                echo "Cleaning up workspace..."
                if [ "${DOCKER_AVAILABLE}" = "true" ]; then
                    docker logout || true
                fi
            '''
        }
        success {
            echo "✅ Successfully deployed $DEPLOY_VERSION version"
        }
        failure {
            script {
                echo "❌ Deployment failed! Attempting rollback..."
                if (env.CURRENT_VERSION && env.CURRENT_VERSION != 'none') {
                    sh """
                        kubectl patch service sample-app-service -n $KUBE_NAMESPACE -p '{"spec":{"selector":{"version":"$CURRENT_VERSION"}}}'
                        echo "Rolled back to $CURRENT_VERSION version"
                    """
                } else {
                    echo "⚠️ No previous version to roll back to"
                }
            }
        }
    }
}
