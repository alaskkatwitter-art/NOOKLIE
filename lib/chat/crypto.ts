import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export function chatCipherVersion() {
  return process.env.CHAT_ENCRYPTION_KEY_V2 === undefined ? 1 : 2;
}
export const chatMediaBucket = 'private-chat';

export function chatMediaPath(threadId: string, messageId: string) {
  const path = `${threadId}/${messageId}.enc`;
  return chatCipherVersion() === 2 ? `v2/${path}` : path;
}

export function encodeChatBody(cipher: Buffer) {
  const encoded = cipher.toString('base64');
  return chatCipherVersion() === 2 ? `v2:${encoded}` : encoded;
}

export function decodeChatBody(value: string) {
  if (value.startsWith('v2:') !== (chatCipherVersion() === 2)) {
    throw new Error('Mensagem de outra versão do chat.');
  }
  return Buffer.from(chatCipherVersion() === 2 ? value.slice(3) : value, 'base64');
}

function key() {
  const value=chatCipherVersion() === 2 ? process.env.CHAT_ENCRYPTION_KEY_V2 : process.env.CHAT_ENCRYPTION_KEY;
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
