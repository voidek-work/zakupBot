module.exports = {
  apps: [
    {
      name: 'zakup-bot',
      script: './dist/index.js',
      instances: 1,
      exec_mode: 'fork', // Telegram polling must be run as single instance to prevent 409 Conflict
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 2000,
      max_memory_restart: '350M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      merge_logs: true,
      env: {
        NODE_ENV: 'production',
      },
      env_development: {
        NODE_ENV: 'development',
      },
    },
  ],
};
