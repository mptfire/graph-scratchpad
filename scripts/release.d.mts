export function unreleased(md: string): string[]
export function nextVersion(version: string, part: 'patch' | 'minor' | 'major'): string
export function cutRelease(md: string, version: string, date: string): string
