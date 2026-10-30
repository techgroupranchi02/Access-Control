module.exports = {
  apps: [
    {
      name: 'access-control-backend',
      script: 'src/app.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env_development: {
        NODE_ENV: 'development',
        APP_PORT: 4000
      },
      env_production: {
        NODE_ENV: 'production',
        APP_PORT: 4000
      }
    }
  ]
};
