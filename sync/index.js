const { Kafka } = require('kafkajs')
const mysql = require('mysql')
const sc = require('socket.io-client')
const { blake2AsHex } = require('@polkadot/util-crypto')
const log4js = require('log4js')
const bs58 = require('bs58')

const socket = sc('http://123.207.140.69:8091')
const kafka = new Kafka({
    clientId: 'my-appp',
    brokers: ['172.21.0.23:9092']
})
const producer = kafka.producer()

var topic = 'topic_testnet_transfer';
var connection = mysql.createConnection({
    host: 'bj-cdb-h5taldie.sql.tencentcdb.com',
    port: 62434,
    user: 'ad',
    password: 'HBRxKeY2ULYEZeR',
    database: 'ad'
})
connection.connect()

log4js.configure({
    appenders: {
        out: { type: 'console' },
        log_file: {
            type: 'dateFile',
            filename: './logs/failed',
            pattern: "yyyy-MM-dd.log",
            alwaysIncludePattern: true,
        }
    },
    categories: {
        default: {
            appenders: ['log_file'],
            level: 'debug'
        }
    }
})

const logger = log4js.getLogger()

function getSqlData(query) {
    return new Promise((resolve, reject) => {
        connection.query(query, function (error, result, fields) {
            if (error) {
                reject(error);
            } else {
                resolve(result)
            }
        })
    })
}

async function sleep(second) {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve()
        }, 1000 * second)
    })
}

function didToHex(did) {
    if (!did) return ''
    const bytes = bs58.decode(did.substring(8))
    return blake2AsHex(bytes, 256)
}

async function adjustBalance(socket) {
    const data = await getSqlData('select t1.address,t1.wxid,t3.did,((t2.balance+t2.`reserved`)-(t1.balance+t1.`reserved`))/1000000000000000 as balance from chain_v1_data_5_2_5 t1 left join chain_v1_data_5_1_old t2 on t1.`wxid` = t2.wxid left join data_did t3 on t1.`address` = t3.`address` where abs((t2.balance+t2.`reserved`)-(t1.balance+t1.`reserved`))/1000000000000000>1 and t3.did <>"did:pra:LvVE2k7TDmkqKZZvbt2R7xTJdR3pK3JFMA" order by ((t2.balance+t2.`reserved`)-(t1.balance+t1.`reserved`))')
    console.log(data.length)
    let i = 0
    for (let element of data) {
        let params = element.balance <= 0 ? {
            address: element.address,
            method: 'transfer',
            params: [didToHex('did:pra:LvVE2k7TDmkqKZZvbt2R7xTJdR3pK3JFMA'), parseInt(Math.abs((element.balance-0.02) * 10 ** 15)), `5-32-${i}`]
        } : {
                address: '5CMDp8RSys5uBwct5XKY1rBtJtisTPuqZkxcbnho3jxWQJ51',
                method: 'transfer',
                params: [didToHex(element.did), parseInt(element.balance * 10 ** 15), `5-32-${i}`]
            }

        logger.info(params)
        socket.emit('sign', params)
        i++
    }
}

function transfer(id, from_did, to_did, balance, addressType) {
    console.log(id, from_did, to_did, balance, addressType)
    producer.send({
        topic: 'topic_testnet_transfer',
        messages: [
            {
                value: JSON.stringify({
                    "id": id,
                    "from_did": from_did,
                    "type": 1,
                    "to_did": to_did,
                    "amount": balance,
                    "addressType": addressType
                })
            }
        ],
    })
}

async function reserved(socket) {
    const arr = await getSqlData('select t1.wxid,t1.address,(t2.`reserved`-t1.reserved) as reserved from chain_v1_data_5_1 t1 left join chain_v1_data_5_1_old t2 on t1.`wxid` = t2.wxid where (t2.`reserved`-t1.reserved)/1000000000000000>0 and t1.balance<(t2.`reserved`-t1.reserved) ')
    console.log(arr.length)

    setTimeout(async () => {
        console.log(arr.length, 'result length')
        for (let i = 0; i < arr.length; i++) {
            let element = arr[i]
            console.log('index', i)
            if (amount > 0) {
                const data = {
                    address: element.address,
                    method: 'lock',
                    params: [element.reserved, 7 * 60 * 60 * 24]
                }
                console.log(data, 'sent --------')
                socket.emit('sign', data)
            }
        }
    }, 1000)

}

async function bind_external_address(ownAddress, address, addressType) {
    if (ownAddress !== null && address !== null && address !== '') {
        const data = JSON.stringify({
            address: ownAddress,
            method: 'addExternalAddress',
            params: [stringToHex(addressType), address]
        })
        socket.emit('sign', data)
        console.log('ownAddress:' + ownAddress + ' 导入' + addressType + "地址:" + address + "成功")
    }
}

socket.on('succeed', message => {
    console.log(message, 'create succeed')
    const { origin, msg } = JSON.parse(message)
    if (origin === 'old') {

    }
})

socket.on('tx_failed', msg => {
    logger.error(msg, 'transaction failed')
})

socket.on('connect', async () => {
    try {
        // adjust user balance
        adjustBalance(socket)

        // lock funds
        // reserved(socket)
    } catch (error) {
        console.log(error)
    }
})
