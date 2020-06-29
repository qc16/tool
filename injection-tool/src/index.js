import os from 'os'
import * as fs from 'fs'
import mysql from 'mysql'
import pdKeyring from '@polkadot/keyring'
import { createType, GenericImmortalEra } from '@polkadot/types'
import { encodeAddress } from '@polkadot/util-crypto'
import { createApi, reload } from 'libs/util'
import { numberToHex, stringToHex } from '@polkadot/util'
// import logger from 'libs/log'

let stepNum = 0
const connection = mysql.createConnection({
  host: 'bj-cdb-h5taldie.sql.tencentcdb.com',
  port: 62434,
  user: 'pratestnet',
  password: '47A7D53ebfdF',
  database: 'prochain-testnet'
})
connection.connect()

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

const parseParams = (params) => params.map(param => {
  if (param.type === 'AccountId' || param.type === 'Address') {
    param.value = encodeAddress(param.value)
  }
  if (param.type === 'Balance' || param.type === 'Compact<Balance>') {
    param.value = numberToHex(param.value)
  }
  if (param.name === 'social_account' || param.name === 'social_superior') {
    if (param.value) param.value = stringToHex(param.value)
  }
  return param.value
})

const getTransactionHistory = (start) => {
  console.log(start, 'start point')
  return new Promise((resolve, reject) => {
    connection.query(`select * from data_extrinsic where module_id in("did","balances", "sudo") order by block_id limit ${start-stepNum}, 1000000`, (error, data) => {
      if (error) {
        reject(error)
      } else {
        // logger.info(data)
        const result = data.map(v => {
          const id = v.nonce
          let whom = `0x${v.address}`
          let section = v.module_id
          let method = v.call_id
          let params = parseParams(JSON.parse(v.params))
          if (v.call_id === 'sudo_as') {
            const [who, call] = JSON.parse(v.params)
            const { call_module, call_function, call_args } = call.value
            whom = who.value
            section = call_module.toLowerCase()
            method = call_function
            params = parseParams(call_args)
            switch (method) {
              case 'add_external_address':
                method = 'addExternalAddress'
                break
              case 'set_group_name':
                method = 'setGroupName'
                break
            }
          }

          switch (v.call_id) {
            case 'add_external_address':
              method = 'addExternalAddress'
              break
            case 'set_group_name':
              method = 'setGroupName'
              break
          }

          return {
            id,
            whom,
            section,
            method,
            params
          }
        })
        .filter(v => v.method !== 'sudo')
        .filter(v => { // filter value larger than 5 prm
          let flag = true
          if (v.section === 'did' && v.method === 'transfer') {
            const value = v.params[1]
            if (value < 5 * 10 ** 15) flag = false
          }
          return flag
        })
        // .filter(v => v.section === 'did' && v.method === 'transfer' && v.params[1] < 5 * 10 ** 15) // filter value less than 5 prm
        connection.end()
        stepNum = result.length
        resolve(result)
      }
    })
  })
}

const getSigner = () => new Promise((resolve, reject) => {
  const homedir = os.homedir()
  fs.readFile(
    `${homedir}/.substrate/sudo`,
    async (err, res) => {
      if (err) {
        reject(err)
      } else {
        const keyring = new pdKeyring({ type: 'sr25519' })

        const seed = res.toString().replace(/[\r\n]/g, '')
        const pair = keyring.addFromMnemonic(seed)

        resolve(pair)
      }
    }
  )
})

const sudoAs = async () => {
  const api = await createApi()
  const sudoKey = await getSigner()
  console.log(sudoKey.address, 'sudo key---')

  if (sudoKey.address !== (await api.query.sudo.key()).toString()) {
    console.log(sudoKey.address)
    console.log((await api.query.sudo.key()).toString())
    throw Error('This is not the secret for the Sudo key.')
  }

  const { nonce: startingNonce } = await api.query.system.account(sudoKey.address)
  const data = await getTransactionHistory(Number(startingNonce))
  console.log(data.length, 'data length')
  let index = 0
  try {
    for (const entry of data) {
      const {
        id, whom, section, method, params
      } = entry
      const proposal = api.tx[section][method](...params)
      const nonce = Number(startingNonce) + index
      const tip = 0.02 * 10 ** 15

      const era = createType(api.registry, 'ExtrinsicEra', new GenericImmortalEra(api.registry))

      const logString = `Sending transaction ${section}::${method} from ${whom} with sudo key ${sudoKey.address} and nonce: ${nonce} and id ${id}.`
      console.log(logString)

      const unsub = await api.tx.sudo.sudoAs(whom, proposal).signAndSend(sudoKey, {
        blockHash: api.genesisHash, era, nonce
      }, (result) => {
        const { events, status } = result

        console.log('Current status is', status.type)
        if (status.type === 'Future') {
          console.log('exit of future')
          process.exit(0)
        }
        fs.appendFileSync('sudAs.hashes.log', `${logString}\n` + `Current status is${status.type}\n`)

        if (status.isFinalized) {
          console.log(`Transaction included at blockHash ${status.asFinalized}`)
          fs.appendFileSync('sudoAs.hashes.log', `${logString}\n${status.asFinalized.toString()}\n`)
          // Loop through Vec<EventRecord> to display all events
          events.forEach(({ phase, event: { data, method, section } }) => {
            fs.appendFileSync('sudoAs.hashes.log', `\t' ${phase}: ${section}.${method}:: ${data}\n`)
          })
          unsub()
        }
      })

      index++
      await sleep(500)
    }
  } catch (e) {
    process.exit(1)
    console.log(e, 'error')
  }
}

process.on('exit', () => {
  console.log('restart-----------')
  reload()
})

sudoAs().catch(console.log)
