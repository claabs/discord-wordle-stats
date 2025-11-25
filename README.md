# Discord Wordle Stats

A Discord bot that calculates statistics for the official Discord Wordle application.

## Features

- Displays average score, total game count, and failed game count per user
- Handles the bug where the official Wordle application sometimes doesn't properly tag users
- Ability to manually set nicknames for edge cases

## Caveats

- Doesn't support multiple users using the same nicknames
- It just parses the results message, so incomplete games count as an "X" (a fail)
- Only servers are supported; does not support Wordle stats when played in a DM with the official Wordle application

## Quick Start (Docker)

### Docker Run Example

```sh
docker run --rm --init \
  -v $(pwd)/data:/data \
  -e BOT_TOKEN=abcdefghijklmnopqrstuvwxyz.abcdef.abcdefghijklmnopqrstuvwxyz1234567890AB \
  ghcr.io/claabs/discord-wordle-stats
```

### Docker Compose Example

```yaml
services:
  sleepnumber-stats:
    image: ghcr.io/claabs/discord-wordle-stats
    init: true
    environment:
      BOT_TOKEN: abcdefghijklmnopqrstuvwxyz.abcdef.abcdefghijklmnopqrstuvwxyz1234567890AB
    volumes:
      - ./data:/data
    restart: unless-stopped
```

## Configuration

### Environment Variables

- **`BOT_TOKEN`**: Required. The Discord bot token for your application.
- **`OWNER_ID`**: Optional. Discord user ID for the bot owner in addition to guild moderators; used for moderator-restricted commands.
- **`LOG_LEVEL`**: Optional. Logging verbosity. Defaults to `info`. Common values: `debug`, `info`, `warn`, `error`.

### Discord Bot Config

#### Installation

- Installation Contexts
  - [ ] User install
  - [x] Guild install
- Default Install Settings
  - Scopes: `application.commands`, `bot`
  - Permissions: `Read Message History`, `View Channels`

#### Bot

- Enable **Presence Intent**
  - required to match nicknames to users in the member list
- Enable **Message Content Intent**
  - required to read the Wordle bot's past messages

## To Do

- Resolve eslint ignores
- Optional trigger when Wordle bot posts results message
- Add screenshots
- Improve leaderboard formatting (profile images, emojis, podium)
