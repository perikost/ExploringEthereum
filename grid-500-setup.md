# Setup
### Nodejs
Install nodejs via the guix package manager and make it available in every session by adding the appropriate environment variables in `.bashrc`. 
```
guix install node
echo -e 'export GUIX_PROFILE=~/.guix-profile\nsource "$GUIX_PROFILE/etc/profile"' >> .bashrc && source .bashrc
node --version
```

### Set up the project
Clone the project and install the dependencies. Note that this is a draft implementation and covers very specific use cases. It will be improved in the near future.
```
git clone https://github.com/perikost/ExploringEthereum.git 
cd ExploringEthereum && git checkout remote-dfs-experiments
npm i && cd ..
```

### Go
Install Golang. Quic-go v.0.24.0 which is a dependency of Swarm (v.1.8.2) [doesn't support](https://github.com/ipfs/kubo/issues/8819) go 1.18,  so  1.17.13 is used instead. This is probably fixed in the most recent version of Swarm's bee client.  
```
curl -LO https://go.dev/dl/go1.17.13.linux-amd64.tar.gz
mkdir go-installation && tar -C ~/go-installation -xzf go1.17.13.linux-amd64.tar.gz
rm -rf go1.17.13.linux-amd64.tar.gz

echo -e 'export GOROOT="$HOME/go-installation/go"\nexport GOPATH="$HOME/go"\nexport PATH="$GOPATH/bin:$GOROOT/bin:$PATH"' >> .bashrc && source .bashrc

# confirm that the installation was successful
go version
```
Go paths explained : https://stackoverflow.com/questions/7970390/what-should-be-the-values-of-gopath-and-goroot

### Bee
Install Swarm's bee client v.1.8.2.
```
git clone https://github.com/ethersphere/bee && cd bee && git checkout v1.8.2
make binary
echo 'export "PATH=$PATH:$HOME/bee/dist"' >> .bashrc && source .bashrc

# confirm that the installation was successful
cd .. && bee version
```

**Copy bee configuration to remote**

For convenience, if you intend to overwrite the default configuration make a `bee.yaml` config file in your local machine and copy this to every node you set up.
```
site=<site_name>
scp ~/bee-config.yaml mylogin@access.grid5000.fr:"$site"/bee.yaml
```

Below are the fields i usually override. Fot testnet `mainnet` should be set false, `swap-endpoint` to a goerli endpoint and `network-id` to 10  
```
api-addr: 127.0.0.1:1633
bootnode: [/dnsaddr/testnet.ethswarm.org]
cache-capacity: "500000"
config: /home/<username>/bee.yaml
data-dir: /home/<username>/.bee
db-open-files-limit: 2000
debug-api-addr: 127.0.0.1:1635
debug-api-enable: true
full-node: true
mainnet: false
nat-addr: "......"
network-id: 10
p2p-addr: :1634
password: "my_password"
swap-endpoint: wss://goerli.infura.io/ws/v3/....
swap-initial-deposit: 1000000000000000
```

Start the bee client to create your keys and write the output to a log for convenience.

`bee start --config /home/<username>/bee.yaml | tee -a swarm_setup.log`

Fund your bee node's address with goerlis and bzz tokens (0.05 gEth and 0.2 bzz should be enough). The address is printed in the output of the above command, thus also written in the log file. Alternatively it can be found in `<data-dir>/keys/swarm.key`.

You can decrypt the account that bee created in order to import it in a wallet, using a custom script. 
```
npm --prefix ~/ExploringEthereum run decrypt -- <data-dir>/keys/swarm.key <password>
```

### IPFS
```
wget https://dist.ipfs.tech/kubo/v0.16.0/kubo_v0.16.0_linux-amd64.tar.gz && tar -C ~/ -xzf kubo_v0.16.0_linux-amd64.tar.gz && rm kubo_v0.16.0_linux-amd64.tar.gz
echo 'export "PATH=$PATH:$HOME/kubo"' >> .bashrc && source .bashrc

# confirm that the installation was successful
ipfs version

# initialize and run your ipfs node
ipfs init --profile server
ipfs daemon
```

### Store site's name in a variable 
Ensure that the site name is always available in a variable.
```
# add site to .bashrc
site=$(echo ${GUIX_DAEMON_SOCKET} | cut -d'.' -f 2) && echo "export current_site=${site}" >> .bashrc
source .bashrc && echo ${current_site}
```

# Run the experiments

### Login to each site

Sync project
```
cd ~/ExploringEthereum
git checkout remote-dfs-experiments
git fetch origin && git reset --hard origin/remote-dfs-experiments
cd
```

Reserve a job today at a specific hour and save the `job_id` to a file

`oarsub -l nodes=1,walltime=1:00:00 -r "$(date +'%Y-%m-%d') 21:00:00" > current_job && source current_job && echo ${OAR_JOB_ID}`

### When jobs are ready
Connect to the job from within each site

`source current_job && oarsub -C ${OAR_JOB_ID}`
`echo "node="$(hostname | cut -d'.' -f 1)"" > current_node`

Enable ipv6

`sudo-g5k dhclient -6 br0`

### Open necessary ports (site frontend)
This should be run from the frontend of the corresponding site and not from inside the job. Alternatively provide your login credentials with the `-u` option (e.g. `-u mylogin:mypassword`) to make the call from your local machine.
```
source .bashrc && source ~/current_node && source ~/current_job && IPV6NODE=${node}-ipv6.${current_site}.grid5000.fr && curl -i https://api.grid5000.fr/stable/sites/${current_site}/firewall/${OAR_JOB_ID} -d "[{\"addr\": \"${IPV6NODE}\", \"port\": \"4001 1634\"}]"
```

### Run the experiments
Only on the machine which will act as the server and collect all the data
```
npm --prefix ~/ExploringEthereum/ run server -- --port <port>
npm --prefix ~/ExploringEthereum/ run remote-experiments -- --times 4
```

Inside each job
```
# run ipfs and swarm in the background but keep the stdout and stderr for monitoring
source .bashrc
ipfs daemon  >> ~/ipfs.log 2>>~/ipfs.error &
bee start --config /home/<username>/bee.yaml >> ~/swarm.log 2>>~/swarm.error &

# confirm both clients are online
ipfs swarm peers | wc -l && curl -s localhost:1635/peers | jq ".peers | length"

# connect to the server
npm --prefix ~/ExploringEthereum/ run remote-experiments -- --ip <server_ip> --port <server_port> --times 4

```
Press enter on any of the connected clients to start the experiment.

### Keep stats about the current environment (Optional)
While the job is still running you can keep some basic stats about the current environment and the nodes' connectivity status.
```
# make a folder
source current_job && source .bashrc
job_path=~/jobs-info/${OAR_JOB_ID}_$(date +'%d_%m_%Y') && mkdir -p ${job_path}

# save host related info
free -h > ${job_path}/mem 
lscpu > ${job_path}/cpu
hostnamectl > ${job_path}/os

# query and save the number of nodes our IPFS and Swarm instances are connected to
ipfs swarm peers > ${job_path}/ipfs.peers
cat ${job_path}/ipfs.peers | wc -l >> ${job_path}/ipfs.peers
curl -s localhost:1635/peers | jq > ${job_path}/swarm.peers
cat ${job_path}/swarm.peers | jq ".peers | length" >> ${job_path}/swarm.peers
```
