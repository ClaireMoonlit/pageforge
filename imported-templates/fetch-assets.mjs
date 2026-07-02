// 抓每个 StartBootstrap 模板的 dist/assets 目录下的所有图片
import { readdirSync, mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

const repos = ['agency', 'clean-blog', 'creative', 'freelancer', 'grayscale', 'landing-page', 'modern-business', 'new-age', 'resume']
const outRoot = 'public/imported-templates'

for (const repo of repos) {
  const assetDir = join(outRoot, `assets-${repo}`)
  mkdirSync(assetDir, { recursive: true })
  const url = `https://data.jsdelivr.com/v1/package/gh/StartBootstrap/startbootstrap-${repo}@master/flat`
  try {
    const res = await fetch(url)
    if (!res.ok) { console.log(`${repo}: list failed ${res.status}`); continue }
    const data = await res.json()
    const files = (data.files || [])
      .map((f) => f.name)
      .filter((n) => n.startsWith('/dist/assets/') && /\.(png|jpg|jpeg|svg|gif|ico|webp)$/i.test(n) && !/^.*favicon\./i.test(n))
    console.log(`${repo}: ${files.length} images to fetch`)
    let ok = 0, fail = 0
    for (const path of files) {
      const rel = path.replace(/^\/dist\/assets\//, '')
      const dst = join(assetDir, rel)
      if (existsSync(dst) && statSync(dst).size > 0) { ok++; continue }
      mkdirSync(join(dst, '..'), { recursive: true })
      const fileUrl = `https://cdn.jsdelivr.net/gh/StartBootstrap/startbootstrap-${repo}@master/dist/assets/${rel}`
      try {
        const r = await fetch(fileUrl)
        if (r.ok) {
          const buf = Buffer.from(await r.arrayBuffer())
          writeFileSync(dst, buf)
          ok++
        } else { fail++ }
      } catch { fail++ }
    }
    console.log(`  -> ok=${ok} fail=${fail}`)
  } catch (e) {
    console.log(`${repo}: error ${e.message}`)
  }
}
