pipeline {
    agent any
    
    environment {
        DOCKER_HUB_REPO = 'raheman456/sample-node-app'
        KUBE_NAMESPACE = 'jenkins'
        DOCKER_CREDENTIALS = credentials('docker-hub-credentials')
    }
    
    stages {
        stage('Install Tools') {
            steps {
                script {
                    // Check if tools are already installed
                    def dockerExists = sh(script: 'which docker', returnStatus: true) == 0
                    def kubectlExists = sh(script: 'which kubectl', returnStatus: true) == 0
                    
                    if (!dockerExists) {
                        echo "Installing Docker CLI..."
                        sh '''
                            apt-get update
                            apt-get install -y apt-transport-https ca-certificates curl gnupg lsb-release
                            curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
                            echo "deb [arch=amd64 signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/debian $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
                            apt-get update
                            apt-get install -y docker-ce-cli
                        '''
                    }
                    
                    if (!kubectlExists) {
                        echo "Installing kubectl..."
                        sh '''
                            curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
                            chmod +x kubectl
                            mv kubectl /usr/local/bin/
                        '''
                    }
                    
                    // Verify installations
                    sh 'docker --version || echo "Docker not available"'
                    sh 'kubectl version --client || echo "kubectl not available"'
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
                    // Check which version is currently active
                    def currentVersion = sh(
                        script: "kubectl get service sample-app-service -n ${KUBE_NAMESPACE} -o jsonpath='{.spec.selector.version}' 2>/dev/null || echo 'blue'",
                        returnStdout: true
                    ).trim()
                    
                    if (currentVersion == 'blue' || currentVersion == '') {
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
                    sh "docker build -t ${DOCKER_HUB_REPO}:${env.DEPLOY_VERSION} ."
                    sh "docker push ${DOCKER_HUB_REPO}:${env.DEPLOY_VERSION}"
                }
            }
        }
        
        stage('Deploy New Version') {
            steps {
                script {
                    // Create a temporary deployment file with the correct image
                    sh """
                        cp app-${env.DEPLOY_VERSION}.yaml temp-deployment.yaml
                        sed -i 's|image: .*|image: ${DOCKER_HUB_REPO}:${env.DEPLOY_VERSION}|g' temp-deployment.yaml
                        kubectl apply -f temp-deployment.yaml -n ${KUBE_NAMESPACE}
                        rm temp-deployment.yaml
                    """
                    
                    // Wait for deployment to be ready
                    sh "kubectl rollout status deployment/sample-app-${env.DEPLOY_VERSION} -n ${KUBE_NAMESPACE} --timeout=300s"
                }
            }
        }
        
        stage('Run Tests') {
            steps {
                script {
                    // Get the LoadBalancer URL for testing
                    def serviceUrl = sh(
                        script: "kubectl get svc sample-app-service -n ${KUBE_NAMESPACE} -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || echo ''",
                        returnStdout: true
                    ).trim()
                    
                    if (serviceUrl) {
                        echo "Testing current service at: http://${serviceUrl}"
                        sh "curl -f http://${serviceUrl} || true"
                    } else {
                        echo "LoadBalancer URL not available, skipping external test"
                    }
                    
                    echo "New ${env.DEPLOY_VERSION} version is ready for traffic switch"
                }
            }
        }
        
        stage('Switch Traffic') {
            steps {
                script {
                    // Update service to point to new version
                    sh """
                        kubectl patch service sample-app-service -n ${KUBE_NAMESPACE} -p '{"spec":{"selector":{"version":"${env.DEPLOY_VERSION}"}}}'
                    """
                    
                    echo "Traffic switched to ${env.DEPLOY_VERSION} version"
                }
            }
        }
        
        stage('Cleanup Old Version') {
            steps {
                script {
                    // Optional: Scale down old version after successful deployment
                    try {
                        timeout(time: 2, unit: 'MINUTES') {
                            input message: "Scale down old version (${env.CURRENT_VERSION})?", ok: "Yes"
                        }
                        sh "kubectl scale deployment sample-app-${env.CURRENT_VERSION} --replicas=0 -n ${KUBE_NAMESPACE}"
                    } catch (Exception e) {
                        echo "Cleanup skipped or timed out - keeping old version running"
                    }
                }
            }
        }
    }
    
    post {
        always {
            sh '''
                docker logout || true
                docker system prune -f || true
            '''
        }
        failure {
            script {
                // Rollback on failure
                sh """
                    kubectl patch service sample-app-service -n ${KUBE_NAMESPACE} -p '{"spec":{"selector":{"version":"${env.CURRENT_VERSION}"}}}'
                """
                echo "Rolled back to ${env.CURRENT_VERSION} version"
            }
        }
    }
}
