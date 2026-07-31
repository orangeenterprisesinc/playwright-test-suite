# Bump this tag in lockstep with @playwright/test in package.json — a
# version-skewed browser bundle is the #1 cause of flaky container runs.
FROM mcr.microsoft.com/playwright:v1.58.2-noble

WORKDIR /app

# Installed before the rest of the source is copied in, so `docker build`
# only re-runs `npm ci` when package.json/package-lock.json actually change.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Override at `docker run` time, e.g.:
#   docker run --rm -e BASE_URL=https://qa.example.com -e TEST_ENV=qa playwright-test-suite --grep=@Smoke
ENV TEST_ENV=local

ENTRYPOINT ["npx", "playwright", "test"]
