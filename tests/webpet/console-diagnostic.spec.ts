import { test, expect } from './fixtures'

type Entry = { route: string; kind: string; text: string; location?: string }

async function capture(page: import('@playwright/test').Page, route: string) {
  const entries: Entry[] = []

  page.on('console', (msg) => {
    const type = msg.type()
    if (type === 'error' || type === 'warning') {
      const loc = msg.location()
      entries.push({
        route,
        kind: `console.${type}`,
        text: msg.text(),
        location: loc.url ? `${loc.url}:${loc.lineNumber}:${loc.columnNumber}` : undefined,
      })
    }
  })

  page.on('pageerror', (err) => {
    entries.push({
      route,
      kind: 'pageerror',
      text: `${err.name}: ${err.message}`,
      location: err.stack?.split('\n').slice(0, 4).join('\n'),
    })
  })

  page.on('requestfailed', (req) => {
    entries.push({
      route,
      kind: 'requestfailed',
      text: `${req.method()} ${req.url()} — ${req.failure()?.errorText ?? 'unknown'}`,
    })
  })

  await page.goto(route, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  return entries
}

test('capture console for /setup/fields and /profile', async ({ page }) => {
  const all: Entry[] = []
  all.push(...(await capture(page, '/setup/fields')))
  all.push(...(await capture(page, '/profile')))

  console.log('\n====== CONSOLE DIAGNOSTIC REPORT ======')
  if (all.length === 0) {
    console.log('(no console errors/warnings/pageerrors captured)')
  } else {
    for (const e of all) {
      console.log(`\n[${e.route}] ${e.kind}`)
      console.log(`  ${e.text}`)
      if (e.location) console.log(`  at ${e.location}`)
    }
  }
  console.log('\n====== END REPORT ======\n')

  expect(true).toBe(true)
})
