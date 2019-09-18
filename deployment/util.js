const ethUtil = require('ethereumjs-utils')
const recoverAddress = (address, nonce, intentHash, approved, v, r, s) => {

    const msgHash = ethUtil.keccak(Buffer.concat([toBuffer(address, 20), toBuffer(nonce, 32), toBuffer(intentHash, 32), toBuffer(approved ? 1 : 0, 1)]))

    const publicKey = ethUtil.ecrecover(msgHash, v, r, s)

    const hashedRecover = ethUtil.keccak(publicKey).toString('hex')
    const addr = hashedRecover.substr(24)
    return "0x" + addr

}
const signHash = (pk, msgHash) => {
    const s = ethUtil.ecsign(toBuffer(msgHash, 32), toBuffer(pk, 32))

    return {
        ...s,
        address: getAddress(pk),
        msgHash: toHex(msgHash, 32),
        r: toHex(s.r),
        s: toHex(s.s),
        v: s.v,
        signatureBytes: toHex(s.r) + toHex(s.s).substr(2) + toHex(s.v).substr(2)
    }
}

const sign = (address, nonce, intentHash, approved, pk) => {

    const msgHash = ethUtil.keccak(Buffer.concat([toBuffer(address, 20), toBuffer(nonce, 32), toBuffer(intentHash, 32), toBuffer(approved ? 1 : 0, 1)]))
    const s = ethUtil.ecsign(msgHash, toBuffer(pk, 32))

    return {
        ...s,
        address: getAddress(pk),
        msgHash: toHex(msgHash, 32),
        r: toHex(s.r),
        s: toHex(s.s),
        v: s.v
    }
}

function getAddress(pk) {
    const key = toBuffer(pk)
    return ethUtil.toChecksumAddress(ethUtil.privateToAddress(key).toString('hex'))
}

function toBuffer(val, len = -1) {
    if (val && val._isBigNumber) val = val.toHexString()
    if (typeof val == 'string')
        val = val.startsWith('0x')
            ? Buffer.from((val.length % 2 ? '0' : '') + val.substr(2), 'hex')
            : val.length && (parseInt(val) || val == '0')
                ? new ethUtil.BN(val).toArrayLike(Buffer)
                : Buffer.from(val, 'utf8')
    else if (typeof val == 'number')
        val = val === 0 && len === 0 ? Buffer.allocUnsafe(0) : Buffer.from(fixLength(val.toString(16)), 'hex')

    if (!val) val = Buffer.allocUnsafe(0)

    // since rlp encodes an empty array for a 0 -value we create one if the required len===0
    if (len == 0 && val.length == 1 && val[0] === 0)
        return Buffer.allocUnsafe(0)


    // if we have a defined length, we should padLeft 00 or cut the left content to ensure length
    if (len > 0 && Buffer.isBuffer(val) && val.length !== len)
        return val.length < len
            ? Buffer.concat([Buffer.alloc(len - val.length), val])
            : val.slice(val.length - len)

    return val

}

function toHex(val, bytes) {
    if (val === undefined) return undefined
    let hex
    if (typeof val === 'string')
        hex = val.startsWith('0x') ? val.substr(2) : (parseInt(val[0]) ? new BN(val).toString(16) : Buffer.from(val, 'utf8').toString('hex'))
    else if (typeof val === 'number')
        hex = val.toString(16)
    else
        hex = ethUtil.bufferToHex(val).substr(2)
    if (bytes)
        hex = padStart(hex, bytes * 2, '0')   // workarounf for ts-error in older js
    if (hex.length % 2)
        hex = '0' + hex
    return '0x' + hex.toLowerCase()
}

function padStart(val, minLength, fill = ' ') {
    while (val.length < minLength)
        val = fill + val
    return val
}
const fixLength = (hex) => hex.length % 2 ? '0' + hex : hex
module.exports = { recoverAddress, sign, signHash }