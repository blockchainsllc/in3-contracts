export const devPk = '0x4d5db4107d237df6a3d58ee5f70ae63d73d7658d4026f2eefd2f204c81682cb7'

/** creates a random private key and transfers some ether to this address */
export async function createAccount(seed, eth = toBN('50000000000000000000')) {
    const pkBuffer = seed
        ? seed.startsWith('0x')
            ? Buffer.from(seed.substr(2).padStart(64, '0'), 'hex')
            : Buffer.from(seed.padStart(64, '0'), 'hex')
        : crypto.randomBytes(32)

    const pk = '0x' + pkBuffer.toString('hex')
    const adr = getAddress(pk)

    if (eth)
        await sendTransaction(this.url, {
            privateKey: devPk,
            gas: 222000,
            to: adr,
            data: '',
            value: eth,
            confirm: true
        })

    return pk
}
