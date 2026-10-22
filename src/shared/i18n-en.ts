// English texts for the German keys used with t() and msg() (see i18n.ts). Grouped by the area they appear in.
export const EN: Record<string, string> = {
  // Comprehensive analysis (main process)
  'uv-Download fehlgeschlagen (HTTP {status})': 'uv download failed (HTTP {status})',
  'uv-Download beschädigt (Prüfsumme falsch)': 'uv download corrupted (checksum mismatch)',
  'uv nach dem Entpacken nicht gefunden': 'uv not found after unpacking',
  'Die umfassende Analyse gibt es nur für Windows und Linux (x64).':
    'The comprehensive analysis is only available for Windows and Linux (x64).',
  'Unbekannter Schlüssel': 'Unknown key',
  'Ungültiger Schlüssel': 'Invalid key',
  'Ungültige Anfrage für die Analyse': 'Invalid analysis request',
  'Die umfassende Analyse ist noch nicht eingerichtet': 'The comprehensive analysis is not set up yet',
  'Es läuft bereits eine Analyse': 'An analysis is already running',
  'Kein API-Key für {provider} hinterlegt': 'No API key saved for {provider}',
  Abgebrochen: 'Cancelled',
  'Analyse beendet mit Code {code}': 'Analysis exited with code {code}',
  'Lade uv …': 'Downloading uv …',
  'Lade Python {version} …': 'Downloading Python {version} …',
  'Installiere TradingAgents {version} …': 'Installing TradingAgents {version} …',

  // Forecast and price data (main process)
  'Modell-Download fehlgeschlagen (HTTP {status})': 'Model download failed (HTTP {status})',
  'Modell-Download beschädigt (Prüfsumme falsch)': 'Model download corrupted (checksum mismatch)',
  'Ungültige Prognose-Anfrage': 'Invalid forecast request',
  'Ungültige Prognose-Gruppen': 'Invalid forecast groups',
  'Zu wenige Kursdaten für eine Prognose (mindestens {min} Kerzen)':
    'Not enough price data for a forecast (at least {min} candles)',
  'Symbol nicht gefunden – Tipp: Firmenname in die Suche eingeben':
    'Symbol not found – tip: type the company name into the search',
  'Ungültiges Symbol: {symbol}': 'Invalid symbol: {symbol}',
  'Keine Kursdaten für {symbol}': 'No price data for {symbol}',
  'Ungültiger Timeframe: {tf}': 'Invalid timeframe: {tf}',
  'Ungültiges Key-Format': 'Invalid key format',
  'API-Key ungültig': 'Invalid API key',
  'Finnhub: kein Kurs für {symbol}': 'Finnhub: no price for {symbol}',
  'Yahoo: kein Kurs für {symbol}': 'Yahoo: no price for {symbol}',
  'Finnhub nicht erreichbar': 'Finnhub unreachable',
  'Finnhub-Fehler': 'Finnhub error',
  'Binance: {symbol} nicht gefunden (HTTP {status})': 'Binance: {symbol} not found (HTTP {status})',

  // About dialog
  'Willkommen bei KandleOS': 'Welcome to KandleOS',
  'Über KandleOS': 'About KandleOS',
  Schließen: 'Close',
  'Keine Anlageberatung': 'Not investment advice',
  'KandleOS ist ein Werkzeug zur technischen Chartanalyse. Indikatoren, Zeichnungen, die Kursprognose (Chronos-2) und die umfassende Analyse mit TradingAgents (Texte von Sprachmodellen, die irren können) sind Hilfsmittel und':
    'KandleOS is a tool for technical chart analysis. Indicators, drawings, the price forecast (Chronos-2) and the comprehensive analysis with TradingAgents (texts from language models, which can be wrong) are aids and',
  'keine Anlageberatung': 'not investment advice',
  'und keine Kauf- oder Verkaufsempfehlung. Alle Kurse ohne Gewähr: Daten können verzögert, unvollständig oder fehlerhaft sein. Die Nutzung erfolgt auf eigenes Risiko; Anlageentscheidungen triffst du selbst.':
    'nor a recommendation to buy or sell. All prices without guarantee: data may be delayed, incomplete or wrong. Use at your own risk; investment decisions are yours alone.',
  Datenschutz: 'Privacy',
  'KandleOS erhebt keine Nutzungsdaten und sendet nichts an den Hersteller (keine Telemetrie). Watchlist, Zeichnungen und Einstellungen bleiben auf diesem Rechner, der Finnhub-API-Key wird verschlüsselt gespeichert. Zum Laden der Kurse verbindet sich die App direkt mit diesen Anbietern, die dabei technisch bedingt deine IP-Adresse erhalten; es gelten deren Datenschutzbestimmungen, die Server stehen teils in den USA:':
    'KandleOS collects no usage data and sends nothing to its maker (no telemetry). Watchlist, drawings and settings stay on this computer; the Finnhub API key is stored encrypted. To load prices, the app connects directly to these providers, which necessarily receive your IP address; their privacy policies apply, and some servers are in the USA:',
  'Binance – Kryptokurse': 'Binance – crypto prices',
  'Yahoo Finance – Aktienkurse, Symbolsuche und Namen': 'Yahoo Finance – stock prices, symbol search and names',
  'Finnhub – Echtzeit-Aktienkurse, nur wenn ein eigener API-Key eingetragen ist':
    'Finnhub – real-time stock prices, only if you enter your own API key',
  'Hugging Face – einmaliger Download des Prognosemodells beim ersten Klick auf „Prognose“':
    'Hugging Face – one-time download of the forecast model on the first click on “Forecast”',
  'Nur wenn du die': 'Only when you set up and start the',
  'umfassende Analyse mit TradingAgents': 'comprehensive analysis with TradingAgents',
  'einrichtest und startest: Beim Einrichten lädt KandleOS Python und TradingAgents von GitHub und dem Python-Paketindex (PyPI). Bei jeder Analyse gehen das Symbol und die gesammelten Markt-, Nachrichten- und Unternehmensdaten an den von dir gewählten KI-Anbieter (Anthropic, OpenAI, Google, DeepSeek oder Alibaba; mit Ollama bleibt die KI auf deinem Rechner). Die Daten holt TradingAgents u. a. von Yahoo Finance, SEC EDGAR, Reddit, StockTwits, Polymarket und – mit eigenem Key – FRED. Deine API-Keys werden verschlüsselt gespeichert und nur an das lokale Analyseprogramm übergeben.':
    'does more data leave your computer. During setup, KandleOS downloads Python and TradingAgents from GitHub and the Python Package Index (PyPI). With each analysis, the symbol and the collected market, news and company data go to the AI provider you chose (Anthropic, OpenAI, Google, DeepSeek or Alibaba; with Ollama the AI stays on your computer). TradingAgents gets its data from Yahoo Finance, SEC EDGAR, Reddit, StockTwits, Polymarket and – with your own key – FRED, among others. Your API keys are stored encrypted and only passed to the local analysis program.',
  'Datenquellen und Marken': 'Data sources and trademarks',
  'Kursdaten stammen von den genannten Anbietern und unterliegen deren Nutzungsbedingungen. Charts: TradingView Lightweight Charts™ (Apache-2.0),':
    'Price data comes from the providers named above and is subject to their terms of use. Charts: TradingView Lightweight Charts™ (Apache-2.0),',
  'Prognosemodell: Amazon Chronos-2 (Apache-2.0) als ONNX-Export von sktime. Umfassende Analyse: TradingAgents von Tauric Research (Apache-2.0), bei Bedarf installiert mit uv von Astral (MIT/Apache-2.0). Alle Marken gehören ihren jeweiligen Inhabern; KandleOS steht in keiner Verbindung zu diesen Unternehmen.':
    'Forecast model: Amazon Chronos-2 (Apache-2.0) as an ONNX export by sktime. Comprehensive analysis: TradingAgents by Tauric Research (Apache-2.0), installed on demand with uv by Astral (MIT/Apache-2.0). All trademarks belong to their respective owners; KandleOS is not affiliated with these companies.',
  Lizenzen: 'Licenses',
  'KandleOS nutzt Open-Source-Software, u. a. Electron, React und Lightweight Charts.':
    'KandleOS uses open-source software, including Electron, React and Lightweight Charts.',
  'Lizenzen von Drittanbietern anzeigen': 'Show third-party licenses',
  Verstanden: 'Got it',

  // Comprehensive analysis panel
  Kaufen: 'Buy',
  Übergewichten: 'Overweight',
  Halten: 'Hold',
  Untergewichten: 'Underweight',
  Verkaufen: 'Sell',
  Entscheidung: 'Decision',
  Markt: 'Market',
  Stimmung: 'Sentiment',
  Nachrichten: 'News',
  Fundamental: 'Fundamentals',
  Debatte: 'Debate',
  Risiko: 'Risk',
  'Der API-Key wurde vom Anbieter abgelehnt. Bitte in „Einrichten“ prüfen.':
    'The provider rejected the API key. Please check it under “Set up”.',
  'Beim Anbieter fehlt Guthaben oder das Kontingent ist aufgebraucht.':
    'Your account at the provider is out of credit or its quota is used up.',
  'Der Anbieter ist ausgelastet oder das Anfragelimit ist erreicht. Später erneut versuchen.':
    'The provider is overloaded or the rate limit was reached. Try again later.',
  'Der KI-Dienst ist nicht erreichbar (bei Ollama: läuft es?).':
    'The AI service cannot be reached (with Ollama: is it running?).',
  'Das gewählte Modell gibt es beim Anbieter nicht. Bitte in „Einrichten“ ändern.':
    'The chosen model does not exist at the provider. Please change it under “Set up”.',
  'Umfassende Analyse': 'Comprehensive analysis',
  'mit TradingAgents · {symbol}': 'with TradingAgents · {symbol}',
  Einrichten: 'Set up',
  'Umfassende Analyse einrichten': 'Set up comprehensive analysis',
  'Analyse von {symbol} läuft · {time}': 'Analysing {symbol} · {time}',
  'Starte …': 'Starting …',
  '{calls} Modellaufrufe · {in} Tokens rein · {out} raus': '{calls} model calls · {in} tokens in · {out} out',
  Abbrechen: 'Cancel',
  'Prüfe …': 'Checking …',
  'Für {provider} ist noch kein API-Key hinterlegt.': 'No API key saved for {provider} yet.',
  '{analysts} Analysten · {rounds} Debattenrunde(n)': '{analysts} analysts · {rounds} debate round(s)',
  '{symbol} analysieren': 'Analyse {symbol}',
  'Dauert einige Minuten und kostet beim Anbieter Guthaben. Daten bis heute; keine Anlageberatung.':
    'Takes a few minutes and uses credit at the provider. Data up to today; not investment advice.',
  'Dauert einige Minuten. Daten bis heute; keine Anlageberatung.':
    'Takes a few minutes. Data up to today; not investment advice.',
  'Gespeicherte Analysen': 'Saved analyses',
  'Ohne klares Urteil': 'No clear verdict',
  Kursziel: 'Price target',
  'Horizont: {horizon}': 'Horizon: {horizon}',
  Einstieg: 'Entry',
  Position: 'Position',
  'Statistische Prognose von Chronos-2 aus dem Kursverlauf, zum Vergleich':
    'Statistical forecast by Chronos-2 from the price history, for comparison',
  'Chronos-Prognose: Median nach {steps} Kerzen {value}': 'Chronos forecast: median after {steps} candles {value}',
  'Kursziel, Einstieg und Stop im Chart zeigen': 'Show price target, entry and stop in the chart',
  '{calls} Modellaufrufe · {tokens} Tokens': '{calls} model calls · {tokens} tokens',
  Berichte: 'Reports',
  'Vier Analysten sammeln Daten': 'Four analysts gather data',
  'Chart und Indikatoren, Stimmung (Reddit, StockTwits), Nachrichten und Fundamentaldaten wie Bilanzen.':
    'Chart and indicators, sentiment (Reddit, StockTwits), news and fundamentals such as balance sheets.',
  'Bull und Bear debattieren': 'Bull and bear debate',
  'Ein Optimist und ein Skeptiker streiten über Chancen und Risiken.':
    'An optimist and a sceptic argue over opportunities and risks.',
  'Ein Trader macht einen Plan': 'A trader makes a plan',
  'Kaufen, halten oder verkaufen, mit Einstieg, Stop-Loss und Positionsgröße.':
    'Buy, hold or sell, with entry, stop-loss and position size.',
  'Drei Risiko-Prüfer hinterfragen ihn': 'Three risk reviewers challenge it',
  'Offensiv, neutral und vorsichtig.': 'Aggressive, neutral and conservative.',
  'Der Portfolio-Manager entscheidet': 'The portfolio manager decides',
  'Einschätzung in fünf Stufen, Kursziel und Zeithorizont.':
    'Rating on a five-step scale, price target and time horizon.',
  Methode: 'Method',
  'Statistisches Modell (Chronos-2) aus dem Kursverlauf': 'Statistical model (Chronos-2) from the price history',
  'Sprachmodelle lesen Daten, Nachrichten und Zahlen': 'Language models read data, news and figures',
  Ergebnis: 'Result',
  'Kursverlauf mit Wahrscheinlichkeitsfächer': 'Price path with probability fan',
  'Einschätzung, Kursziel, Trade-Plan und Berichte': 'Rating, price target, trade plan and reports',
  Dauer: 'Duration',
  Sekunden: 'Seconds',
  'Einige Minuten': 'A few minutes',
  Kosten: 'Cost',
  'Kostenlos, läuft lokal': 'Free, runs locally',
  'Eigener API-Key (kostet je Analyse) oder lokal mit Ollama':
    'Your own API key (costs per analysis) or locally with Ollama',
  'Ein Team aus KI-Agenten analysiert {symbol}': 'A team of AI agents analyses {symbol}',
  'Wie in einem Analystenhaus prüfen mehrere spezialisierte KI-Agenten die Aktie oder Kryptowährung, diskutieren das Für und Wider und schreiben einen ausführlichen Bericht mit Einschätzung. Grundlage ist das Open-Source-Projekt TradingAgents.':
    'Like in a research firm, several specialised AI agents examine the stock or cryptocurrency, debate the pros and cons and write a detailed report with a rating. It is based on the open-source project TradingAgents.',
  'So läuft eine Analyse': 'How an analysis works',
  'Das bekommst du': 'What you get',
  'Dazu Kursziel und Zeithorizont, Einstieg und Stop-Loss als Linien im Chart sowie alle Einzelberichte zum Nachlesen. Jede Analyse wird gespeichert.':
    'Plus price target and time horizon, entry and stop-loss as lines in the chart, and every individual report to read. Each analysis is saved.',
  'Unterschied zur KI-Prognose': 'Difference from the AI forecast',
  'KI-Prognose': 'AI forecast',
  'Was du brauchst': 'What you need',
  'Einen API-Key': 'An API key',
  'von Anthropic (Claude), OpenAI, Google, DeepSeek oder Alibaba (Qwen). Jede Analyse kostet dort Guthaben, weil viele Modellaufrufe nötig sind.':
    'from Anthropic (Claude), OpenAI, Google, DeepSeek or Alibaba (Qwen). Each analysis uses credit there, because it needs many model calls.',
  'Oder Ollama': 'Or Ollama',
  'für KI auf dem eigenen Rechner: kostenlos und offline, aber langsamer und mit schwächeren Ergebnissen; braucht einen leistungsstarken PC.':
    'for AI on your own computer: free and offline, but slower and with weaker results; needs a powerful PC.',
  'Einmalig rund 350 MB': 'A one-time download',
  'Download (Python und TradingAgents). Alles bleibt im Datenordner von KandleOS und lässt sich jederzeit wieder entfernen.':
    'of about 350 MB (Python and TradingAgents). Everything stays in the KandleOS data folder and can be removed at any time.',
  'Bei einer Analyse gehen das Symbol und die gesammelten Daten an den gewählten KI-Anbieter. Sprachmodelle können sich irren – die Analyse ist keine Anlageberatung. TradingAgents ist ein Open-Source-Projekt von Tauric Research (Apache-2.0); KandleOS ist kein offizielles Produkt dieses Projekts.':
    'During an analysis, the symbol and the collected data go to the chosen AI provider. Language models can be wrong – the analysis is not investment advice. TradingAgents is an open-source project by Tauric Research (Apache-2.0); KandleOS is not an official product of that project.',

  // Comprehensive analysis setup
  gespeichert: 'saved',
  '•••••••• (neu eingeben zum Ersetzen)': '•••••••• (enter a new one to replace it)',
  'API-Key einfügen': 'Paste API key',
  Speichern: 'Save',
  'Key entfernen': 'Remove key',
  '{label} entfernen': 'Remove {label}',
  'Python-Umgebung der umfassenden Analyse entfernen? Gespeicherte Keys und Analysen bleiben erhalten.':
    'Remove the Python environment of the comprehensive analysis? Saved keys and analyses are kept.',
  'Umfassende Analyse mit TradingAgents einrichten': 'Set up comprehensive analysis with TradingAgents',
  'Ein Team aus KI-Agenten (TradingAgents, Open Source) analysiert Technik, Stimmung, Nachrichten und Fundamentaldaten, diskutiert Chancen und Risiken und gibt eine Einschätzung mit Kursziel. Keine Anlageberatung.':
    'A team of AI agents (TradingAgents, open source) analyses technicals, sentiment, news and fundamentals, debates opportunities and risks and gives a rating with a price target. Not investment advice.',
  '1 · Programm': '1 · Program',
  'TradingAgents {version} ist eingerichtet': 'TradingAgents {version} is set up',
  Entfernen: 'Remove',
  'Lade Installationsprogramm (uv) …': 'Downloading installer (uv) …',
  'Lade Python …': 'Downloading Python …',
  'Installiere TradingAgents …': 'Installing TradingAgents …',
  'Einmalig wird eine eigene Python-Umgebung mit TradingAgents im Datenordner von KandleOS angelegt (einige hundert MB, je nach Verbindung ein paar Minuten). Am System wird nichts installiert.':
    'A separate Python environment with TradingAgents is created once in the KandleOS data folder (a few hundred MB, a few minutes depending on your connection). Nothing is installed on the system.',
  'Jetzt einrichten': 'Set up now',
  '2 · KI-Anbieter': '2 · AI provider',
  'Key gespeichert': 'Key saved',
  'API-Key für {provider}': 'API key for {provider}',
  'Wird verschlüsselt gespeichert und nur an das lokale Analyseprogramm übergeben. Key erstellen:':
    'Stored encrypted and only passed to the local analysis program. Create a key:',
  'Jede Analyse kostet beim Anbieter Guthaben (viele Modellaufrufe).':
    'Each analysis uses credit at the provider (many model calls).',
  'Ollama-Adresse': 'Ollama address',
  'Prüfe Ollama …': 'Checking Ollama …',
  'Ollama antwortet nicht. Installieren von ollama.com, starten und ein Modell laden (z. B. „ollama pull qwen3“).':
    'Ollama is not responding. Install it from ollama.com, start it and pull a model (e.g. “ollama pull qwen3”).',
  'Ollama läuft, {n} Modell(e) geladen. Kostenlos und offline, aber deutlich langsamer und schwächer als Cloud-Modelle.':
    'Ollama is running, {n} model(s) available. Free and offline, but much slower and weaker than cloud models.',
  'Ollama läuft, aber es ist noch kein Modell geladen („ollama pull qwen3“).':
    'Ollama is running, but no model is available yet (“ollama pull qwen3”).',
  'Modell für Entscheidungen': 'Model for decisions',
  'Modell für Datensammlung': 'Model for data gathering',
  '3 · Zusätzliche Daten': '3 · Additional data',
  'FRED API-Key (optional, kostenlos)': 'FRED API key (optional, free)',
  'Makrodaten der US-Notenbank (Zinsen, Inflation, Arbeitsmarkt). Ohne Key fehlen sie nur. Key:':
    'Macro data from the US Federal Reserve (interest rates, inflation, labour market). Without a key it is simply left out. Key:',
  '4 · Analyse': '4 · Analysis',
  Debattenrunden: 'Debate rounds',
  'mehr Runden = gründlicher, aber länger und teurer': 'more rounds = more thorough, but slower and more expensive',
  Fertig: 'Done',

  // Chart
  'Lade {symbol} …': 'Loading {symbol} …',
  'Keine Daten für {symbol}': 'No data for {symbol}',
  'KI-Ziel': 'AI target',
  Stop: 'Stop',
  'Währung der Kurse': 'Price currency',
  'Zu wenige Kerzen für eine Prognose: {n} von mindestens {min}. Eine kürzere Kerzengröße wählen.':
    'Too few candles for a forecast: {n} of at least {min}. Choose a shorter candle size.',
  'Statistische Prognose der nächsten {n} Kerzen mit Chronos-2, lokal berechnet: Median (gestrichelt) mit Fächer aus 50/80/90 %-Bereichen, Werte beim Überfahren, dazu ein Rückblick auf die Treffsicherheit. Keine Anlageberatung.':
    'Statistical forecast of the next {n} candles with Chronos-2, computed locally: median (dashed) with a fan of 50/80/90 % ranges, values on hover, plus a backtest of its accuracy. Not investment advice.',
  'Beim ersten Mal wird das Modell geladen (ca. 480 MB).': 'The first time, the model is downloaded (about 480 MB).',
  'Prognose aus': 'Forecast off',
  'Lade Modell {pct} %': 'Downloading model {pct} %',
  'Rechne …': 'Computing …',
  'Prognose-Anzeige: Linie oder Kerzen, Bereiche, Rückblick – und die umfassende Analyse mit TradingAgents':
    'Forecast display: line or candles, ranges, backtest – and the comprehensive analysis with TradingAgents',
  'Prognose-Anzeige einstellen': 'Forecast display settings',
  Zeitraum: 'Time range',
  '{title} ({tf}-Kerzen)': '{title} ({tf} candles)',
  'Vorbörse und Nachbörse (US-Aktien, 10:00–15:30 und 22:00–02:00 deutscher Zeit) als Kerzen zeigen, grau hinterlegt':
    'Show pre-market and after-hours trading (US stocks, 4:00–9:30 and 16:00–20:00 New York time) as candles, shaded grey',
  'Vor-/Nachbörse gibt es nur bei Aktien und Kerzen unter einem Tag':
    'Pre-/after-market is only available for stocks with candles shorter than a day',
  'Vor-/Nachbörse': 'Pre/after market',
  'Punkt {n} von {total} · Esc bricht ab': 'Point {n} of {total} · Esc cancels',

  // Drawing tools
  Auswahl: 'Select',
  'Trendlinie (2 Klicks)': 'Trend line (2 clicks)',
  'Strahl – Trendlinie bis zum Rand verlängert (2 Klicks)': 'Ray – trend line extended to the edge (2 clicks)',
  'Horizontale Linie (1 Klick)': 'Horizontal line (1 click)',
  'Vertikale Linie (1 Klick)': 'Vertical line (1 click)',
  'Parallelkanal (3 Klicks: Linie, dann Abstand)': 'Parallel channel (3 clicks: line, then width)',
  'Rechteck / Zone (2 Klicks)': 'Rectangle / zone (2 clicks)',
  'Fibonacci Retracement (2 Klicks: Hoch → Tief)': 'Fibonacci retracement (2 clicks: high → low)',
  'Elliott-Impuls 0-1-2-3-4-5 (6 Klicks)': 'Elliott impulse 0-1-2-3-4-5 (6 clicks)',
  'Elliott-Korrektur 0-A-B-C (4 Klicks)': 'Elliott correction 0-A-B-C (4 clicks)',
  'Messen – Preis, Prozent und Kerzen (2 Klicks)': 'Measure – price, percent and candles (2 clicks)',
  'Ausgewählte Zeichnung löschen (Entf)': 'Delete selected drawing (Del)',
  'Ausgewählte Zeichnung löschen': 'Delete selected drawing',
  'Alle {count} Zeichnungen für {symbol} löschen?': 'Delete all {count} drawings for {symbol}?',
  'Alle Zeichnungen für {symbol} löschen': 'Delete all drawings for {symbol}',
  'Alle Zeichnungen löschen': 'Delete all drawings',
  '{n} Kerzen': '{n} candles',
  'Vollbild (Umschalt+F)': 'Fullscreen (Shift+F)',
  'Vollbild beenden (Esc)': 'Exit fullscreen (Esc)',
  '{name} schließen': 'Close {name}',
  'Tab schließen': 'Close tab',
  'Höchstens {max} Charts gleichzeitig': 'At most {max} charts at once',
  'Neuer Chart-Tab': 'New chart tab',

  // Forecast tooltip and settings
  Median: 'Median',
  Eröffnung: 'Open',
  'Hoch / Tief': 'High / Low',
  '50 %-Bereich': '50 % range',
  '80 %-Bereich': '80 % range',
  '90 %-Bereich': '90 % range',
  'Über {price}': 'Above {price}',
  Prognose: 'Forecast',
  'Kerze {n}': 'candle {n}',
  'Für einen Rückblick muss vor dem Prognosezeitraum noch genug Historie liegen.':
    'A backtest needs enough history before the forecast period.',
  'Rückblick: zu wenig Historie': 'Backtest: not enough history',
  'Das Modell hat {runs}× ab früheren Zeitpunkten je {steps} Kerzen prognostiziert (die jüngste davon grau gepunktet im Chart) und wurde mit dem echten Verlauf verglichen.':
    'The model forecast {steps} candles {runs}× from earlier points in time (the latest of these dotted grey in the chart) and was compared with what actually happened.',
  'Ø Abweichung: mittlerer Abstand des Medians zum echten Schlusskurs.':
    'Avg. error: mean distance of the median from the actual close.',
  'Im 80 %-Bereich: Anteil echter Kurse innerhalb des 80 %-Fächers – gut kalibriert sind etwa 80 % (im 50 %-Bereich: {in50}, ideal etwa 50 %).':
    'In 80 % range: share of actual prices inside the 80 % fan – well calibrated is about 80 % (in the 50 % range: {in50}, ideally about 50 %).',
  'Richtung: ob der Median am Ende richtig über oder unter dem Startkurs lag.':
    'Direction: whether the median ended correctly above or below the starting price.',
  'Vergangene Treffsicherheit ist keine Garantie für die Zukunft.': 'Past accuracy is no guarantee for the future.',
  'Rückblick:': 'Backtest:',
  'Ø Abweichung {error} · im 80 %-Bereich {in80} · Richtung {hits}/{runs} richtig':
    'avg. error {error} · in 80 % range {in80} · direction {hits}/{runs} right',
  'wo der Kurs am wahrscheinlichsten liegt': 'where the price is most likely',
  'übliche Schwankung': 'typical swing',
  'auch seltene Ausschläge': 'including rare spikes',
  'Prognose-Anzeige': 'Forecast display',
  'KI-Prognose mit Chronos-2': 'AI forecast with Chronos-2',
  'Statistische Prognose aus dem Kursverlauf, lokal auf deinem Rechner berechnet. Keine Anlageberatung.':
    'Statistical forecast from the price history, computed locally on your computer. Not investment advice.',
  Darstellung: 'Style',
  'Linie (Median)': 'Line (median)',
  Kerzen: 'Candles',
  'Je Schritt eine Kerze: Schlusskurs-Median der Prognose, dazu die prognostizierte typische Dochtlänge. Sie zeigt den wahrscheinlichsten Verlauf, keine echten Kursschwankungen.':
    'One candle per step: the forecast median of the close, plus the typical forecast wick length. It shows the most likely path, not real price swings.',
  Unsicherheitsbereiche: 'Uncertainty ranges',
  Zusätzlich: 'Extras',
  Rückblick: 'Backtest',
  'Werte beim Überfahren': 'Values on hover',
  Berechnung: 'Calculation',
  'Prognose-Länge': 'Forecast length',
  Auto: 'Auto',
  'Kerzen in die Zukunft; Auto: bis 64, je nach vorhandener Historie':
    'Candles into the future; Auto: up to 64, depending on the available history',
  Aus: 'Off',
  'Treffsicherheit früherer Prognosen (die jüngste grau im Chart): mehr ist aussagekräftiger, rechnet aber länger':
    'Accuracy of earlier forecasts (the latest grey in the chart): more is more meaningful but takes longer',
  'Automatisch aktualisieren': 'Update automatically',
  'Neu berechnen, sobald eine neue Kerze beginnt': 'Recompute as soon as a new candle begins',
  'Erweitert · optional': 'Advanced · optional',
  'Umfassende Analyse mit TradingAgents': 'Comprehensive analysis with TradingAgents',
  'KI-Agenten werten Nachrichten, Zahlen und Stimmung aus und geben Einschätzung und Kursziel. Eigener API-Key oder Ollama nötig.':
    'AI agents evaluate news, figures and sentiment and give a rating and price target. Requires your own API key or Ollama.',

  // Market hours badge
  Geöffnet: 'Open',
  Vorbörse: 'Pre-market',
  Nachbörse: 'After hours',
  Pause: 'Break',
  Geschlossen: 'Closed',
  Feiertag: 'Holiday',
  'bis {time}': 'until {time}',
  'öffnet {time}': 'opens {time}',
  '{phase} ab {time}': '{phase} from {time}',
  'Kryptobörsen handeln rund um die Uhr.': 'Crypto exchanges trade around the clock.',
  'Handelszeiten der Börse (Zeitzone {zone}), Uhrzeiten in deiner Ortszeit.':
    'Exchange trading hours (time zone {zone}), times shown in your local time.',
  unbekannt: 'unknown',
  'Nächster Wechsel: {time}': 'Next change: {time}',
  'Regelzeiten mit Feiertagen; Sonderhandelstage können abweichen.':
    'Regular hours including holidays; special trading days may differ.',
  '{phase}: {price} ({change} zum regulären Schlusskurs), Stand {time}':
    '{phase}: {price} ({change} vs. regular close), as of {time}',
  'Regulärer Kurs und Veränderung zum Vortag': 'Regular price and change from the previous day',

  // Settings
  Einstellungen: 'Settings',
  Sprache: 'Language',
  'Finnhub API-Key': 'Finnhub API key',
  'Ohne Key kommen Aktienkurse über Yahoo Finance (alle 15 s aktualisiert). Mit Key gibt es Echtzeit-Trades über den Finnhub-WebSocket. Kostenloser Key:':
    'Without a key, stock prices come from Yahoo Finance (updated every 15 s). With a key you get real-time trades via the Finnhub WebSocket. Free key:',
  'Der Key wird getrennt von kandleos-store.json gespeichert – verschlüsselt für dein Benutzerkonto, sofern das System einen Schlüsselbund hat (Windows immer, Linux mit gnome-keyring/KWallet). Nach einem Gerätewechsel hier einfach neu eintragen.':
    'The key is stored separately from kandleos-store.json – encrypted for your user account if the system has a keyring (always on Windows, on Linux with gnome-keyring/KWallet). After moving to another device, just enter it here again.',

  // Top bar
  'Symbol oder Name suchen': 'Search symbol or name',
  Krypto: 'Crypto',
  Aktie: 'Stock',
  Indikatoren: 'Indicators',
  'Über KandleOS, Haftung, Datenschutz, Lizenzen': 'About KandleOS, disclaimer, privacy, licenses',
  Minuten: 'Minutes',
  '1 Minute': '1 minute',
  '5 Minuten': '5 minutes',
  '15 Minuten': '15 minutes',
  '30 Minuten': '30 minutes',
  Stunden: 'Hours',
  '1 Stunde': '1 hour',
  '2 Stunden': '2 hours',
  '4 Stunden': '4 hours',
  Tage: 'Days',
  '1 Tag': '1 day',
  '1 Woche': '1 week',
  Monate: 'Months',
  '1 Monat': '1 month',
  '1 Quartal': '1 quarter',
  '1 Halbjahr': '6 months',
  '1 Jahr': '1 year',
  Zeiteinheit: 'Candle size',
  'Alle Kerzengrößen': 'All candle sizes',
  'Yahoo · verzögert': 'Yahoo · delayed',
  'Kein Finnhub-Key: Aktienkurse alle 15 s über Yahoo. Klicken zum Eintragen.':
    'No Finnhub key: stock prices every 15 s via Yahoo. Click to enter one.',
  'Finnhub · prüfe Key…': 'Finnhub · checking key…',
  'API-Key wird geprüft.': 'Checking the API key.',
  'Finnhub · verbinde…': 'Finnhub · connecting…',
  'Key gültig, Echtzeit-Verbindung wird aufgebaut.': 'Key valid, opening the real-time connection.',
  'Finnhub · live': 'Finnhub · live',
  'Key gültig, Echtzeit-Verbindung aktiv.': 'Key valid, real-time connection active.',
  'Finnhub · Fehler': 'Finnhub · error',
  'Aktienkurse kommen ersatzweise über Yahoo.': 'Stock prices come from Yahoo instead.',
  'Letzter Trade: {time}': 'Last trade: {time}',
  'Noch keine Trades empfangen (Börse evtl. geschlossen).': 'No trades received yet (the exchange may be closed).',
  '{symbol} zur Watchlist hinzufügen': 'Add {symbol} to the watchlist',
  '{symbol} hinzufügen zu': 'Add {symbol} to',
  'Neuer Ordner': 'New folder',
  Periode: 'Period',
  '3-fach EMA': 'Triple EMA',
  Kurz: 'Short',
  Mittel: 'Mid',
  Lang: 'Long',
  StdAbw: 'StdDev',
  'ATR-Periode': 'ATR period',
  Faktor: 'Factor',
  Stochastik: 'Stochastic',

  // Watchlist
  Ordner: 'Folder',
  'Noch keine Ordner – oben „Ordner“ klicken.': 'No folders yet – click “Folder” above.',
  Ordnername: 'Folder name',
  'Doppelklick zum Umbenennen': 'Double-click to rename',
  'Symbol hinzufügen': 'Add symbol',
  'Symbol zu {name} hinzufügen': 'Add symbol to {name}',
  'Ordner „{name}“ mit {count} Symbolen löschen?': 'Delete folder “{name}” with {count} symbols?',
  'Ordner löschen': 'Delete folder',
  '{name} löschen': 'Delete {name}',
  'Name oder Symbol': 'Name or symbol',
  'Leer – „+“ oder Symbol hierher ziehen': 'Empty – click “+” or drag a symbol here',
  'Ziehen zum Sortieren oder in einen anderen Ordner': 'Drag to reorder or into another folder',
  'Anzeigename für {symbol}': 'Display name for {symbol}',
  '{symbol} – Doppelklick zum Umbenennen': '{symbol} – double-click to rename',
  '{symbol} umbenennen': 'Rename {symbol}',
  '{symbol} aus {name} entfernen': 'Remove {symbol} from {name}',
  Umbenennen: 'Rename',
  '{name} umbenennen': 'Rename {name}',
  '{name} aufklappen': 'Expand {name}',
  '{name} zuklappen': 'Collapse {name}',

  // Time ranges
  '1T': '1D',
  '5T': '5D',
  '1M': '1M',
  '3M': '3M',
  '6M': '6M',
  YTD: 'YTD',
  '1J': '1Y',
  '5J': '5Y',
  Max: 'Max',
  '5 Tage': '5 days',
  '3 Monate': '3 months',
  '6 Monate': '6 months',
  'Seit Jahresbeginn': 'Year to date',
  '12 Monate': '12 months',
  '5 Jahre': '5 years',
  'Gesamte Historie': 'All history',

  // Comprehensive analysis: providers, analysts and stages
  'Lokal (Ollama)': 'Local (Ollama)',
  'Markt & Technik': 'Market & technicals',
  Fundamentaldaten: 'Fundamentals',
  'Analysten sammeln Daten': 'Analysts gather data',
  'Bull- und Bear-Debatte': 'Bull and bear debate',
  'Research-Manager entscheidet': 'Research manager decides',
  'Trader plant den Trade': 'Trader plans the trade',
  'Risiko-Debatte': 'Risk debate',
  'Portfolio-Manager urteilt': 'Portfolio manager rules',

  // Names of commodities and indices
  Silber: 'Silver',
  Platin: 'Platinum',
  Kupfer: 'Copper',
  'Rohöl WTI': 'Crude oil WTI',
  'Rohöl Brent': 'Crude oil Brent',
  Erdgas: 'Natural gas',
  'Uran (U3O8)': 'Uranium (U3O8)',
  Weizen: 'Wheat',
  Mais: 'Corn',
  'VIX (Volatilität)': 'VIX (volatility)'
}
