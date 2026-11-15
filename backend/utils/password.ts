import * as argon2 from 'argon2';

const ARGON_OPTIONS = { type: argon2.argon2id } as const;

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON_OPTIONS);
}

export function verifyPassword(hash: string, plain: string): Promise<boolean> {
  return argon2.verify(hash, plain);
}

/** Hash "falso" usado quando o e-mail não existe, para o tempo de resposta não revelar isso. */
let dummyHash: Promise<string> | undefined;

export async function simulatePasswordCheck(plain: string): Promise<void> {
  dummyHash ??= hashPassword('gestock-dummy-password');
  await argon2.verify(await dummyHash, plain);
}
