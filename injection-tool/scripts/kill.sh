/bin/sleep 3
ps -ef |grep dist/index.js |awk '{print $2}'|xargs kill -9