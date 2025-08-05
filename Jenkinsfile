pipeline {
    agent any

    environment {
        DOCKER_HUB_REPO = 'raheman456/sample-node-app'
        KUBE_NAMESPACE = 'jenkins'
        PATH = "$PATH:$WORKSPACE/bin"
    }

    stages {
        stage('Install Tools') {
            steps {
                script {
                    // Install kubectl if not available
                    if (sh(script: 'command -v kubectl', returnStatus: true) != 0) {
                        sh '''
                            echo "Installing kubectl..."
                            curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
                            chmod +x kubectl
                            mkdir -p $WORKSPACE/bin
                            mv kubectl $WORKSPACE/bin/
                            echo "kubectl installed to $WORKSPACE/bin"
                        '''
                    }
                    
                    // Verify tools
                    sh '''
                        echo "Installed tools:"
                        $WORKSPACE/bin/kubectl version --client
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
                        script: "$WORKSPACE/bin/kubectl get service sample-app-service -n $KUBE_NAMESPACE -o jsonpath='{.spec.selector.version}' 2>/dev/null || echo 'none'",
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
                }
            }
        }

        stage('Deploy New Version') {
            steps {
                script {
                    sh """
                        echo "Deploying $DEPLOY_VERSION version..."
                        sed "s|{{IMAGE}}|$DOCKER_HUB_REPO:$DEPLOY_VERSION|g" ./app/$DEPLOY_FILE > temp-deploy.yaml
                        $WORKSPACE/bin/kubectl apply -f temp-deploy.yaml -n $KUBE_NAMESPACE
                        $WORKSPACE/bin/kubectl apply -f ./app/app-service.yaml -n $KUBE_NAMESPACE
                        rm temp-deploy.yaml
                        
                        echo "Waiting for deployment to be ready..."
                        $WORKSPACE/bin/kubectl rollout status deployment/sample-app-$DEPLOY_VERSION -n $KUBE_NAMESPACE --timeout=300s
                    """
                }
            }
        }

        stage('Verify Deployment') {
            steps {
                script {
                    sh """
                        echo "Verifying deployment..."
                        $WORKSPACE/bin/kubectl wait --for=condition=available --timeout=300s deployment/sample-app-$DEPLOY_VERSION -n $KUBE_NAMESPACE
                        echo "Verifying service endpoints..."
                        $WORKSPACE/bin/kubectl get endpoints sample-app-service -n $KUBE_NAMESPACE
                    """
                }
            }
        }
    }

    post {
        always {
            sh '''
                echo "Cleaning up workspace..."
                if [ -f temp-deploy.yaml ]; then
                    rm temp-deploy.yaml
                fi
            '''
        }
        failure {
            script {
                echo "❌ Deployment failed! Attempting rollback..."
                if (env.CURRENT_VERSION && env.CURRENT_VERSION != 'none') {
                    sh """
                        $WORKSPACE/bin/kubectl patch service sample-app-service -n $KUBE_NAMESPACE -p '{"spec":{"selector":{"version":"$CURRENT_VERSION"}}}'
                        echo "Rolled back to $CURRENT_VERSION"
                    """
                }
            }
        }
    }
}
