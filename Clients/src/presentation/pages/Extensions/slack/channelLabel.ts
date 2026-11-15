/** A Slack channel name with one leading "#", whether or not Slack stored it with one. */
export function channelLabel(channel: string): string {
  return channel.startsWith("#") ? channel : `#${channel}`;
}
