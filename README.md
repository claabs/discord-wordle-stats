# Discord Wordle Stats

A Discord bot that calculates stats for the official Discord Wordle application.

## Features

- Displays average score, total game count, and failed game count per user
- Handles the bug where the official Wordle application sometimes doesn't properly tag users
- Ability to manually set nicknames for edge cases

## Caveats

- Doesn't support multiple users using the same nicknames
- It just parses the results message, so incomplete games count as an "X" (a fail)
- Fails are scored as a 7

## Quick Start (Docker)

### Docker Run Example

```sh
docker run --rm --init \
  -v $(pwd)/data:/data \
  -e TZ=America/New_York \
  ghcr.io/claabs/discord-wordle-stats
```

### Docker Compose Example

```yaml
services:
  sleepnumber-stats:
    image: ghcr.io/claabs/discord-wordle-stats
    init: true
    environment:
      TZ: "America/New_York"
    volumes:
      - ./data:/data
    restart: unless-stopped
```

## Configuration

All application configuration is provided via a `config.json` file. The optionaly environment variables are:

- `TZ`: Set this to your desired timezone (e.g., `America/New_York`, `UTC`, `Europe/London`). Default is UTC if not set.

### Persistent Data

- The `/data` volume stores the database
