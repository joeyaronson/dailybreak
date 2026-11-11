import { englishDataset, englishRecommendedTransformers, RegExpMatcher } from 'obscenity'

export const NICKNAME_MAX_LENGTH = 10
const matcher = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers })

export function validateNickname(value: unknown): { nickname: string; error: string } {
  if (typeof value !== 'string') return { nickname: '', error: 'Enter a nickname.' }
  const nickname = value.trim().normalize('NFKC').replace(/\s+/gu, ' ')
  if ([...nickname].length < 1 || [...nickname].length > NICKNAME_MAX_LENGTH) {
    return { nickname, error: `Use 1–${NICKNAME_MAX_LENGTH} characters.` }
  }
  if (!/^[\p{L}\p{N} ._'’-]+$/u.test(nickname) || !/[\p{L}\p{N}]/u.test(nickname)) {
    return { nickname, error: 'Use letters, numbers, spaces, or basic punctuation.' }
  }
  // Check accented and spaced/punctuated evasions without changing the display name.
  // The matcher also handles common leetspeak, lookalikes, and repeated letters.
  const folded = nickname.normalize('NFKD').replace(/\p{M}/gu, '')
  const compact = folded.replace(/[\s._'’-]/gu, '')
  if (matcher.hasMatch(folded) || (compact !== folded && matcher.hasMatch(compact))) {
    return { nickname, error: 'Please choose a different nickname.' }
  }
  return { nickname, error: '' }
}
