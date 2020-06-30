const mysql = require('mysql')
const sc = require('socket.io-client')
const { blake2AsHex, decodeAddress } = require('@polkadot/util-crypto')
const {
    hexToString, isHex, u8aToHex, hexStripPrefix
} = require('@polkadot/util')
const log4js = require('log4js')
const bs58 = require('bs58')

const socket = sc('http://123.207.140.69:8091')

var connection = mysql.createConnection({
    host: 'bj-cdb-h5taldie.sql.tencentcdb.com',
    port: 62434,
    user: 'ad_dev',
    password: 'pr0!ChainDev',
    database: 'ad_dev'
})
connection.connect()

log4js.configure({
    appenders: {
        out: { type: 'console' },
        log_file: {
            type: 'dateFile',
            filename: './logs/log',
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

function getDidHash(hex) {
    const did = hexToDid(hex)
    const didHash = didToHex(did)
    return didHash
}

function hexToDid(hex) {
    const bytes = Buffer.from(hexStripPrefix(hex), 'hex')
    const address = bs58.encode(bytes)
    if (address) {
        return `did:pra:${address}`
    }

    return ''
}

function didToHex(did) {
    if (!did) return ''
    const bytes = bs58.decode(did.substring(8))
    return blake2AsHex(bytes, 256)
}
async function create() {
    const data = await getSqlData(`select address,superior,social_account_hash from data_did where address not in (select address from data_did_new) and social_account_hash is not null`)
    let i = 0
    for (let element of data) {
        const { superior, address, social_account_hash: socialAccount } = element
        const pubkey = u8aToHex(decodeAddress(address))
        const params = {
            superior,
            address,
            pubkey,
            didType: '1',
            socialAccount,
            isHash: true
        }
        logger.info(i, params, 'create params')
        socket.emit('create_by_old', params)
        await sleep(0.2)
        i++
    }
}
async function createAndLock() {
    const data = await getSqlData(`select * from data_event where module_id ='did' and event_id = 'Created' order by block_id,extrinsic_idx`)
    let i = 0
    for (let item of data) {
        const [did] = JSON.parse(item.attributes)
        const didHash = getDidHash(did.value)
        const element = await getSqlData(`select * from chain_v1_data where did_hash = '${didHash}'`)
        if (!element[0]) continue
        const { superior, address, wxid, reserved } = element[0]
        const pubkey = u8aToHex(decodeAddress(address))
        const params = {
            superior,
            address,
            pubkey,
            didType: '1',
            socialAccount: wxid
        }
        logger.info(i, params, 'create params')
        socket.emit('create_by_old', params)
        if (reserved > 0) {
            console.log(didHash, reserved, 'did hash')
            const lockParams = {
                address: '5CrRpNbQBTiBmTjpUgJ6mH9YRmopVweLsjffVz7muskYEo2r',
                method: 'forceLock',
                params: [didHash, reserved]
            }
            logger.info(lockParams, 'lock params')
            socket.emit('sign', lockParams)
            await sleep(1)
        }
        await sleep(0.2)
        i++
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
        // createAndLock()
        create()
    } catch (error) {
        console.log(error)
    }
})
