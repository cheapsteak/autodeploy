const os = require('os');

module.exports = {
  apps: [
    {
      name: 'autodeploy',
      script: 'npm',
      args: 'start',
      watch: true,
      ignore_watch: ['[\\/\\\\]\\./', 'node_modules', 'logs'],
      exec_mode: 'fork',
      restart_delay: 1000,
      cron_restart: '5 3 * * 6',
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      pid_file: './logs/child.pid',
      merge_logs: true,
    },
  ],
};
