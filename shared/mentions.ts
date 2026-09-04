export function mentionMatches(text: string) {
    return [...text.matchAll(/(?<![\p{L}\p{N}_@.+-])@([a-z0-9_.-]{1,50})(?![a-z0-9_.-])/giu)];
}

export function mentionUsernames(text: string) {
    return [...new Set(mentionMatches(text).map(match => match[1].toLowerCase()))];
}
