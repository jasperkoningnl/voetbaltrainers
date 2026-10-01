"""Zet zoek- en deeltags (description, canonical, Open Graph, Twitter) en het GoatCounter-script in de <head> van elke publieke pagina,
en schrijft sitemap.xml. Opnieuw draaien is veilig: het blok tussen de markeringen wordt vervangen.
Gebruik: python3 tools/meta_tags.py (vanuit de root van de repo)."""
import re, html, datetime, pathlib
BASE = "https://managerhistory.com/"
SITE = "The Managerial Merry-Go-Round"
DEF_IMG = "images/og-image.jpg"
PAGES = {
    "index.html": ("The Managerial Merry-Go-Round", "Does keeping your manager win you trophies? Every manager and every trophy of 35 European clubs since 1955, from Ferguson to Mourinho.", DEF_IMG),
    "explore.html": ("Explore · The Managerial Merry-Go-Round", "Explore 70 seasons of managers and trophies at 35 European clubs. Compare clubs, leagues and the careers of 800+ managers.", DEF_IMG),
    "articles.html": ("Articles · The Managerial Merry-Go-Round", "Stories from the data: stability and trophies, Ferguson versus Mourinho, the first trophy, which countries export managers, and the GOAT debate.", DEF_IMG),
    "about.html": ("About · The Managerial Merry-Go-Round", "How a Photoshop chart from 2022 became an interactive history of football managers, built with Gemini and Claude.", DEF_IMG),
    "data-methodology.html": ("Data Methodology · The Managerial Merry-Go-Round", "Where the data comes from, how the manager of each season is chosen, how trophies are counted and how the data is checked.", DEF_IMG),
    "credits.html": ("Photo credits · The Managerial Merry-Go-Round", "Photographers and licences of the manager photos used on this site.", DEF_IMG),
    "articles/stability.html": ("Does Stability Win Trophies?", "Long reigns and trophies go together: 53% of seasons in a 10+ season reign end with a trophy, against 17% in seasons with more than one manager. But which causes which?", "images/stability.jpg"),
    "articles/architectjourneyman.html": ("The Architect and The Journeyman", "Ferguson won 25 trophies in 27 seasons, Mourinho 20 in 18. Two ways to win, and why the trophy count favours the one you would not expect.", "images/architect.jpg"),
    "articles/globaltactician.html": ("The Global Tactician", "Which countries export their managers, and which leagues let them in? From English coaches at Ajax to the Spanish and Portuguese wave.", "images/global.jpg"),
    "articles/firsttrophy.html": ("The First Trophy", "Most managers who win something do it in their first season. Is that a law of football, or do they simply not get a second one?", "images/articles/hero-firsttrophy.png"),
    "articles/thegoat.html": ("The GOAT Debate", "Ferguson, Guardiola, Ancelotti or Cruyff? What 70 seasons of data add to the argument about the greatest manager of all time.", "images/goat.jpg"),
}
START, END = "<!-- meta:start -->", "<!-- meta:end -->"
root = pathlib.Path(__file__).resolve().parent.parent
for path, (title, desc, img) in PAGES.items():
    f = root / path
    s = f.read_text(encoding="utf-8")
    s = re.sub(r"\s*" + re.escape(START) + r".*?" + re.escape(END), "", s, flags=re.S)
    s = re.sub(r'\s*<meta name="description"[^>]*>', "", s)
    url = BASE + ("" if path == "index.html" else path)
    e = lambda x: html.escape(x, quote=True)
    block = f"""
    {START}
    <meta name="description" content="{e(desc)}">
    <link rel="canonical" href="{url}">
    <meta property="og:type" content="{'article' if path.startswith('articles/') else 'website'}">
    <meta property="og:site_name" content="{SITE}">
    <meta property="og:title" content="{e(title)}">
    <meta property="og:description" content="{e(desc)}">
    <meta property="og:url" content="{url}">
    <meta property="og:image" content="{BASE + img}">
    <meta name="twitter:card" content="summary_large_image">
    <script data-goatcounter="https://kingjay.goatcounter.com/count" async src="https://gc.zgo.at/count.js"></script>
    {END}"""
    s = s.replace("</head>", block + "\n</head>", 1)
    f.write_text(s, encoding="utf-8")
today = datetime.date.today().isoformat()
urls = "\n".join(f"  <url><loc>{BASE + ('' if p == 'index.html' else p)}</loc><lastmod>{today}</lastmod></url>" for p in PAGES)
(root / "sitemap.xml").write_text(f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{urls}\n</urlset>\n', encoding="utf-8")
print("ok", len(PAGES))
