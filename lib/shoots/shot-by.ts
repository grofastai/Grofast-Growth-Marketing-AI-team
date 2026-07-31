// The single person credited with a video's footage used to be whoever completed the
// shoot — often an admin managing the board, not someone who was actually there. This
// resolves the video's Shot By crew from the shoot's own "who went" list instead, so it
// credits everyone who actually shot it. Falls back to the completer only when no crew
// was recorded at all (an older shoot, or one nobody bothered to tag).
export function resolveShotBy(goingBy: string[] | null | undefined, fallbackUserId: string): string[] {
  if (goingBy && goingBy.length > 0) return goingBy
  return [fallbackUserId]
}
