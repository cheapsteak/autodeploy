const fs = require('fs');
const Docker = require('dockerode');
const docker = new Docker();
const privateKey = fs.readFileSync(__dirname + '/sshkey', 'utf8');
const setupScript = fs.readFileSync(__dirname + '/setup.sh', 'utf8');
const runScript = fs.readFileSync(__dirname + '/run.sh', 'utf8');

const child_process = require('child_process');
const spawn = child_process.spawn;
const debug = require('debug')('autodeploy:src/setupContainer.js');

function execContainer(containerId, cmd, input) {
  return new Promise((resolve, reject) => {
    var cp = spawn('docker', ['exec', '-i', containerId].concat(cmd));
    var chunks = [];
    cp.stdout.on('data', function(chunk) {
      chunks.push(chunk);
    });

    cp.on('error', function(error) {
      console.log(error);
      reject(error);
    });
    cp.on('exit', function(code, signal) {
      debug('execContainer code: %s signal: %s', code, signal);
      code
        ? reject('Failed with status ' + code)
        : console.log(Buffer.concat(chunks).toString('utf8')) ||
          resolve(Buffer.concat(chunks));
    });

    cp.stderr.pipe(process.stderr);

    if (input) input.pipe(cp.stdin).on('error', reject);
  });
}

const execPromise = (container, execOptions) =>
  new Promise((resolve, reject) => {
    container.exec(
      Object.assign(
        {
          AttachStdout: true,
          AttachStderr: true,
        },
        execOptions,
      ),
      (err, execContainer) => {
        err && console.error('err', err);
        execContainer.start((err, stream) => {
          err && console.error('err', err);
          const chunks = [];
          stream.on('end', () => {
            var buffer = Buffer.concat(chunks).toString('utf8');
            resolve(buffer);
          });
          stream.on('error', err => {
            console.error('err', err);
            reject(err);
          });
          stream.on('data', chunk => chunks.push(chunk));
        });
      },
    );
  });

const setupContainer = async (container, branchName) => {
  console.log('creating /root/.ssh');
  await execPromise(container, { Cmd: ['mkdir', '-p', '/root/.ssh'] });

  console.log('copying key to ~/.ssh');
  await execPromise(container, {
    Cmd: [
      'bash',
      '-c',
      ` echo '${privateKey.replace(/\n/g, '\n')}' > /root/.ssh/id_rsa`,
    ],
  });

  await execPromise(container, {
    Cmd: ['chmod', '400', `~/.ssh/id_rsa`],
  });

  console.log('copying setup script');
  await execPromise(container, {
    Cmd: [
      'bash',
      '-c',
      ` echo '${setupScript.replace(/\n/g, '\n')}' > /root/setup.sh`,
    ],
  });

  console.log('copying run script');
  await execPromise(container, {
    Cmd: [
      'bash',
      '-c',
      ` echo '${runScript.replace(/\n/g, '\n')}' > /root/run.sh`,
    ],
  });

  console.log('executing setup script');
  await container.exec(
    {
      Cmd: ['bash', '/root/setup.sh'],
      Env: [`BRANCH=${branchName}`],
      AttachStdout: true,
      AttachStderr: true,
    },
    (err, exec) => {
      err && console.error(err);
      exec.start({ hijack: true, stdin: false }, function(err, stream) {
        docker.modem.demuxStream(stream, process.stdout, process.stderr);
      });
    },
  );
};

module.exports = setupContainer;