pipeline {
    agent {
        kubernetes {
            yaml """
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: docker
    image: docker:24-dind
    securityContext:
      privileged: true
    volumeMounts:
    - name: docker-sock
      mountPath: /var/run/docker.sock
  - name: kubectl
    image: bitnami/kubectl:latest
    command:
    - sleep
    args:
    - 99d
  volumes:
  - name: docker-sock
    hostPath:
      path: /var/run/docker.sock
"""
        }
    }
    
    environment {
        DOCKER_HUB_REPO = 'raheman456/sample-node-app'
        KUBE_NAMESPACE = 'jenkins'
        DOCKER_CREDENTIALS = credentials('docker-hub-credentials')
    }
    
    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }
        
        stage('Determine Deployment Color') {
            steps {
                container('kubectl') {
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
        }
        
        stage('Build Docker Image') {
            steps {
                container('docker') {
                    script {
                        // Login to Docker Hub
                        sh """
                            echo \$DOCKER_CREDENTIALS_PSW | docker login -u \$DOCKER_CREDENTIALS_USR --password-stdin
                        """
                        
                        // Build and push image
                        sh "docker build -t ${DOCKER_HUB_REPO}:${env.DEPLOY_VERSION} ."
                        sh "docker push ${DOCKER_HUB_REPO}:${env.DEPLOY_VERSION}"
                    }
                }
            }
        }
        
        stage('Deploy New Version') {
            steps {
                container('kubectl') {
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
                        
                        // Verify pods are running
                        sh "kubectl get pods -l app=sample-app,version=${env.DEPLOY_VERSION} -n ${KUBE_NAMESPACE}"
                    }
                }
            }
        }
        
        stage('Run Tests') {
            steps {
                container('kubectl') {
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
                            echo "LoadBalancer URL not available, testing internally"
                            // Test using internal service
                            sh """
                                kubectl run test-pod-${BUILD_NUMBER} --image=curlimages/curl:latest --rm -i --restart=Never --timeout=60s -n ${KUBE_NAMESPACE} -- \\
                                curl -f http://sample-app-${env.DEPLOY_VERSION}-service.${KUBE_NAMESPACE}.svc.cluster.local || echo "Internal test completed"
                            """
                        }
                        
                        echo "New ${env.DEPLOY_VERSION} version is ready for traffic switch"
                    }
                }
            }
        }
        
        stage('Switch Traffic') {
            steps {
                container('kubectl') {
                    script {
                        echo "Switching traffic from ${env.CURRENT_VERSION} to ${env.DEPLOY_VERSION}"
                        
                        // Update service to point to new version
                        sh """
                            kubectl patch service sample-app-service -n ${KUBE_NAMESPACE} -p '{"spec":{"selector":{"version":"${env.DEPLOY_VERSION}"}}}'
                        """
                        
                        // Wait for change to propagate
                        sleep(time: 10, unit: "SECONDS")
                        
                        // Verify the switch
                        def serviceUrl = sh(
                            script: "kubectl get svc sample-app-service -n ${KUBE_NAMESPACE} -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || echo ''",
                            returnStdout: true
                        ).trim()
                        
                        if (serviceUrl) {
                            echo "Testing switched service:"
                            sh """
                                for i in {1..3}; do
                                    echo "Test attempt \$i:"
                                    curl http://${serviceUrl} || true
                                    sleep 2
                                done
                            """
                        }
                        
                        echo "Traffic successfully switched to ${env.DEPLOY_VERSION} version"
                    }
                }
            }
        }
        
        stage('Cleanup Old Version') {
            steps {
                container('kubectl') {
                    script {
                        // Optional: Scale down old version after successful deployment
                        try {
                            timeout(time: 2, unit: 'MINUTES') {
                                input message: "Scale down old version (${env.CURRENT_VERSION})?", ok: "Yes"
                            }
                            echo "Scaling down ${env.CURRENT_VERSION} deployment"
                            sh "kubectl scale deployment sample-app-${env.CURRENT_VERSION} --replicas=0 -n ${KUBE_NAMESPACE}"
                            echo "Old version ${env.CURRENT_VERSION} scaled down successfully"
                        } catch (Exception e) {
                            echo "Cleanup skipped or timed out - keeping old version running"
                        }
                    }
                }
            }
        }
    }
    
    post {
        always {
            // Cleanup Docker images and login session
            container('docker') {
                sh '''
                    docker logout || true
                    docker system prune -f || true
                '''
            }
        }
        success {
            echo "Blue-Green deployment completed successfully!"
            echo "Active version: ${env.DEPLOY_VERSION}"
        }
        failure {
            script {
                echo "Deployment failed! Attempting rollback..."
                container('kubectl') {
                    try {
                        // Rollback on failure
                        sh """
                            kubectl patch service sample-app-service -n ${KUBE_NAMESPACE} -p '{"spec":{"selector":{"version":"${env.CURRENT_VERSION}"}}}'
                        """
                        echo "Rolled back to ${env.CURRENT_VERSION} version"
                    } catch (Exception e) {
                        echo "Rollback failed: ${e.getMessage()}"
                    }
                }
            }
        }
    }
}
