module.exports = {
  apps: [
    {
      name: 'viis',
      cwd: '/var/www/viis',
      script: 'pnpm',
      args: 'start',
      env: {
        NODE_ENV: 'production',
        PORT: '4005',
      },
      max_restarts: 10,
      restart_delay: 3000,
      max_memory_restart: '512M',
    },
  ],
};
