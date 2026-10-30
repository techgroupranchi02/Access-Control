pipeline {
    agent any

    options {
        disableConcurrentBuilds()
    }

    triggers {
        githubPush()
    }

    environment {
        DEV_SERVER          = 'root@147.93.105.85'
        PROD_SERVER         = 'root@31.97.239.167'
        DEPLOY_PATH         = '/var/www/Access-Control'
        SSH_CREDS           = 'server-ssh-key'
        PM2_APP_NAME        = 'access-control-backend'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Determine Environment') {
            steps {
                script {
                    def branch = env.BRANCH_NAME ?: (env.GIT_BRANCH ? env.GIT_BRANCH.replaceFirst('^origin/', '').replaceFirst('^refs/heads/', '') : 'development')
                    def isProduction = (branch == 'main' || branch == 'master')
                    env.DEPLOY_BRANCH = branch
                    env.DEPLOY_ENV = isProduction ? 'production' : 'development'
                    env.TARGET_SERVER = isProduction ? env.PROD_SERVER : env.DEV_SERVER

                    echo "=========================================="
                    echo " Repository      : Access-Control (Monorepo)"
                    echo " Branch Detected : ${branch}"
                    echo " Target Env      : ${env.DEPLOY_ENV}"
                    echo " Target Server   : ${env.TARGET_SERVER}"
                    echo " PM2 App Name    : ${env.PM2_APP_NAME}"
                    echo "=========================================="
                }
            }
        }

        stage('Build Frontend & Backend Dependencies') {
            steps {
                dir('backend') {
                    sh 'npm ci || npm install'
                }
                dir('frontend') {
                    sh 'npm ci || npm install'
                    sh 'VITE_API_URL=/api VITE_GOOGLE_CLIENT_ID=1078451955198-d59jvrlqk7c4krt6o89paij67f5iga0b.apps.googleusercontent.com npm run build'
                }
            }
        }

        stage('Deploy') {
            steps {
                sshagent([env.SSH_CREDS]) {
                    script {
                        def server = env.TARGET_SERVER
                        def path = env.DEPLOY_PATH
                        def branch = env.DEPLOY_BRANCH
                        def isProd = (env.DEPLOY_ENV == 'production')

                        echo "Deploying Access-Control to ${env.DEPLOY_ENV} (${server}:${path})..."

                        // Ensure target directories exist on the server
                        sh "ssh -o StrictHostKeyChecking=no ${server} 'mkdir -p ${path}/backend ${path}/frontend/dist'"

                        // 1. Sync Backend codebase (excluding .env, node_modules, logs, .git)
                        echo "📦 Syncing backend codebase..."
                        sh """
                            rsync -avz --delete \
                                --exclude='node_modules' \
                                --exclude='.env' \
                                --exclude='logs' \
                                --exclude='.git' \
                                -e 'ssh -o StrictHostKeyChecking=no' \
                                backend/ ${server}:${path}/backend/ || [ \$? -eq 24 ]
                        """

                        // 2. Sync Frontend (source code for dev git tracking, compiled dist for both)
                        if (!isProd) {
                            echo "📦 Syncing full frontend source for Development..."
                            sh """
                                rsync -avz --delete \
                                    --exclude='.git' \
                                    --exclude='node_modules' \
                                    --exclude='dist' \
                                    --exclude='.env*' \
                                    -e 'ssh -o StrictHostKeyChecking=no' \
                                    frontend/ ${server}:${path}/frontend/ || [ \$? -eq 24 ]
                            """

                            echo "🔄 Syncing Git repository state on Development server..."
                            sh """
                                ssh -o StrictHostKeyChecking=no ${server} \
                                "cd ${path} && if [ -d .git ]; then git fetch origin ${branch} && (git checkout ${branch} 2>/dev/null || git checkout -b ${branch} origin/${branch} 2>/dev/null || true) && git reset --hard origin/${branch} || true; fi"
                            """
                        }

                        echo "🚀 Syncing compiled frontend bundle..."
                        sh """
                            rsync -avz --delete \
                                -e 'ssh -o StrictHostKeyChecking=no' \
                                frontend/dist/ ${server}:${path}/frontend/dist/ || [ \$? -eq 24 ]
                        """

                        // 3. Remote execution: dependencies, database migrations, PM2 reload, Nginx reload
                        def backendInstall = isProd ? "npm install --omit=dev" : "npm install"
                        sh """
                            ssh -o StrictHostKeyChecking=no ${server} '
                                cd ${path}/backend && \
                                ${backendInstall} && \
                                (npm run migrate || true) && \
                                (pm2 reload ${env.PM2_APP_NAME} --update-env || pm2 restart ${env.PM2_APP_NAME} --update-env || pm2 start ecosystem.config.cjs || pm2 start src/app.js --name ${env.PM2_APP_NAME}) && \
                                systemctl reload nginx
                            '
                        """
                    }
                }
            }
        }
    }

    post {
        success {
            echo "✅ Successfully built and deployed Access-Control to ${env.DEPLOY_ENV} (${env.TARGET_SERVER})"
        }
        failure {
            echo "❌ Pipeline failed for Access-Control on branch ${env.BRANCH_NAME ?: 'unknown'}"
        }
    }
}
