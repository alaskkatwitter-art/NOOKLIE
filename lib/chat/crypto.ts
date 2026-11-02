import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function key() {
  const value=process.env.CHAT_ENCRYPTION_KEY;
  if(!value || !/^[a-f0-9]{64}$/i.test(value))throw new Error('O chat está indisponível: chave de proteção não configurada.');
  return Buffer.from(value,'hex');
}
export function encryptChat(value:Buffer,aad:string):Buffer {
  const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',key(),iv);cipher.setAAD(Buffer.from(aad));
  return Buffer.concat([iv,cipher.update(value),cipher.final(),cipher.getAuthTag()]);
}
export function decryptChat(value:Buffer,aad:string):Buffer {
  if(value.length<28)throw new Error('Mensagem protegida inválida.');
  const decipher=createDecipheriv('aes-256-gcm',key(),value.subarray(0,12));decipher.setAAD(Buffer.from(aad));decipher.setAuthTag(value.subarray(-16));
  return Buffer.concat([decipher.update(value.subarray(12,-16)),decipher.final()]);
}
