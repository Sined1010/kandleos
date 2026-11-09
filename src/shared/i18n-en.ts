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
  'Binance – Kryptokurse': 'Binance – crypto prices',
  'Deutsche Börse und Wikidata – ISIN und WKN, nur beim Klick auf die Infos zu einem Wert':
    'Deutsche Börse and Wikidata – ISIN and WKN, only when you open the info on a symbol',
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
  'KandleOS ist freie Software: Du darfst es unter den Bedingungen der GNU General Public License, Version 3 oder (nach deiner Wahl) jeder späteren Version, weitergeben und verändern. Es wird ohne jede Gewährleistung bereitgestellt. Der Lizenztext liegt als LICENSE.txt im Programmordner und unter':
    'KandleOS is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License, version 3 or (at your option) any later version. It comes without any warranty. The license text is in LICENSE.txt in the program folder and at',
  'KandleOS nutzt Open-Source-Software, u. a. Electron, React und Lightweight Charts.':
    'KandleOS uses open-source software, including Electron, React and Lightweight Charts.',
  'Lizenzen von Drittanbietern anzeigen': 'Show third-party licenses',
  'Quellcode:': 'Source code:',

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
  'Finnhub · prüfe Key…': 'Finnhub · checking key…',
  'API-Key wird geprüft.': 'Checking the API key.',
  'Finnhub · verbinde…': 'Finnhub · connecting…',
  'Key gültig, Echtzeit-Verbindung wird aufgebaut.': 'Key valid, opening the real-time connection.',
  'Finnhub · live': 'Finnhub · live',
  'Key gültig, Echtzeit-Verbindung aktiv.': 'Key valid, real-time connection active.',
  'Finnhub · Fehler': 'Finnhub · error',
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
  '„{name}“ aus der Watchlist löschen?': 'Remove “{name}” from the watchlist?',
  'Tab „{name}“ schließen? Seine Zeichnungen ({count}) gehen verloren.': 'Close tab “{name}”? Its drawings ({count}) will be lost.',
  'Ordner löschen': 'Delete folder',
  '{name} löschen': 'Delete {name}',
  'Name oder Symbol': 'Name or symbol',
  'Leer – „+“ oder Symbol hierher ziehen': 'Empty – click “+” or drag a symbol here',
  'Ziehen zum Sortieren oder in einen anderen Ordner · Rechtsklick für weitere Aktionen': 'Drag to reorder or into another folder · right-click for more actions',
  'Aktionen für {symbol}': 'Actions for {symbol}',
  'Öffnen': 'Open',
  'In neuem Tab öffnen': 'Open in new tab',
  'Infos zum Wert': 'Company info',
  'Aus Watchlist löschen': 'Remove from watchlist',
  'Verschieben nach …': 'Move to …',
  'Kein anderer Ordner': 'No other folder',
  'Listenansicht': 'List view',
  'Ordneransicht': 'Folder view',
  'Zurück zu den Ordnern': 'Back to folders',
  '{name} öffnen': 'Open {name}',
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
  'VIX (Volatilität)': 'VIX (volatility)',

  // Stock data sources: Alpaca, Yahoo, crypto only
  'Kein Alpaca-Key hinterlegt. In den Einstellungen eintragen.': 'No Alpaca key saved. Enter one in the settings.',
  'Alpaca: API-Key ungültig': 'Alpaca: invalid API key',
  'Alpaca: Anfragelimit erreicht, gleich erneut versuchen': 'Alpaca: rate limit reached, try again shortly',
  'Alpaca nicht erreichbar': 'Alpaca unreachable',
  '{symbol} gibt es bei Alpaca nicht: Alpaca liefert nur US-Aktien und ETFs. Indizes, Rohstoffe und ausländische Börsen lassen sich in den Einstellungen über Yahoo Finance ergänzen.':
    '{symbol} is not available on Alpaca: Alpaca only serves US stocks and ETFs. Indices, commodities and foreign exchanges can be added via Yahoo Finance in the settings.',
  'Indizes, Rohstoffe und Börsen außerhalb der USA über Yahoo Finance (nur für private Zwecke).':
    'Indices, commodities and exchanges outside the US via Yahoo Finance (for private use only).',
  'Aktienkurse sind ausgeschaltet. In den Einstellungen eine Datenquelle für Aktien wählen.':
    'Stock prices are switched off. Choose a data source for stocks in the settings.',
  'KandleOS erhebt keine Nutzungsdaten und sendet nichts an den Hersteller (keine Telemetrie). Watchlist, Zeichnungen und Einstellungen bleiben auf diesem Rechner, API-Keys werden verschlüsselt gespeichert. Zum Laden der Kurse verbindet sich die App direkt mit diesen Anbietern, die dabei technisch bedingt deine IP-Adresse erhalten; es gelten deren Datenschutzbestimmungen, die Server stehen teils in den USA:':
    'KandleOS collects no usage data and sends nothing to its maker (no telemetry). Watchlist, drawings and settings stay on this computer; API keys are stored encrypted. To load prices, the app connects directly to these providers, which necessarily receive your IP address; their privacy policies apply, and some servers are in the USA:',
  'Alpaca – Aktienkurse, Symbolsuche und Namen, nur mit eigenem API-Key':
    'Alpaca – stock prices, symbol search and names, only with your own API key',
  'Datenquelle für Aktien': 'Data source for stocks',
  'Finnhub API-Key (optional)': 'Finnhub API key (optional)',
  'Keys gespeichert': 'Keys saved',
  'API-Key-ID (neu eingeben zum Ersetzen)': 'API key ID (enter a new one to replace it)',
  'API-Key-ID': 'API key ID',
  'Secret Key': 'Secret key',
  'Ich nutze Yahoo Finance nur für private Zwecke. Es gelten Yahoos Nutzungsbedingungen; KandleOS steht in keiner Verbindung zu Yahoo.':
    'I use Yahoo Finance for private purposes only. Yahoo’s terms of service apply; KandleOS is not affiliated with Yahoo.',
  'Yahoos Nutzungsbedingungen': 'Yahoo’s terms of service',
  'Nur Krypto': 'Crypto only',
  'Alpaca · IEX': 'Alpaca · IEX',
  'Aktienkurse über Alpaca: Echtzeit von der Börse IEX, alle 5 s. Klicken für die Einstellungen.':
    'Stock prices via Alpaca: real time from the IEX exchange, every 5 s. Click for the settings.',
  'Aktienkurse alle 15 s über Yahoo Finance (nur für private Zwecke). Klicken für die Einstellungen.':
    'Stock prices every 15 s via Yahoo Finance (for private use only). Click for the settings.',
  'Keine Datenquelle für Aktien gewählt. Klicken für die Einstellungen.': 'No data source for stocks chosen. Click for the settings.',
  'Aktienkurse kommen ersatzweise über die gewählte Datenquelle.': 'Stock prices come from the chosen data source instead.',
  'Kurse': 'Prices',
  'Aktien, Indizes und Rohstoffe weltweit kommen von Yahoo Finance (je nach Börse meist 15 Minuten verzögert), Kryptokurse live von Binance – ohne Anmeldung.': 'Stocks, indices and commodities worldwide come from Yahoo Finance (usually delayed by 15 minutes, depending on the exchange), crypto prices live from Binance – no sign-up needed.',
  'Echtzeit-Kurse für US-Aktien: Alpaca (offizielle Schnittstelle) oder Finnhub kannst du jederzeit in den Einstellungen eintragen.': 'Real-time prices for US stocks: you can add Alpaca (official interface) or Finnhub in the settings at any time.',
  'Ohne Aktien starten (nur Krypto)': 'Start without stocks (crypto only)',
  'Deine Aktienquelle ist Alpaca. Ändern kannst du sie jederzeit in den Einstellungen.': 'Your stock source is Alpaca. You can change it in the settings at any time.',
  'Bitte zuerst auswählen, welche Kurse du sehen möchtest.': 'Please choose first which prices you want to see.',
  'KandleOS ist ein Werkzeug zur Chartanalyse. Prognosen und Analysen sind keine Anlageberatung und keine Kauf- oder Verkaufsempfehlung. Alle Kurse ohne Gewähr; die Nutzung erfolgt auf eigenes Risiko.':
    'KandleOS is a tool for chart analysis. Forecasts and analyses are not investment advice nor a recommendation to buy or sell. All prices without guarantee; use at your own risk.',
  'Mehr zu Haftung, Datenschutz und Lizenzen': 'More on disclaimer, privacy and licenses',
  'Verstanden, los geht’s': 'Got it, let’s go',
  'Startfenster erneut zeigen': 'Show the start window again',
  'Aktien über Alpaca':
    'Stocks via Alpaca',
  'empfohlen für US-Werte':
    'recommended for US markets',
  'Nur US-Aktien und ETFs, in Echtzeit von der Börse IEX. Offizielle Schnittstelle; ein kostenloses Alpaca-Konto ist nötig.':
    'US stocks and ETFs only, in real time from the IEX exchange. Official interface; a free Alpaca account is required.',
  'Auch Indizes, Rohstoffe und Aktien außerhalb der USA (z. B. DAX) über Yahoo Finance ergänzen. Ich nutze Yahoo Finance nur für private Zwecke; es gelten Yahoos Nutzungsbedingungen.':
    'Also add indices, commodities and stocks outside the US (e.g. DAX) via Yahoo Finance. I use Yahoo Finance for private purposes only; Yahoo’s terms of service apply.',
  'Keys entfernen':
    'Remove keys',
  'Kostenlos registrieren und unter „API Keys“ ein Key-Paar erstellen; ein Testkonto (Paper Trading) ohne Geld genügt:':
    'Sign up for free and create a key pair under “API Keys”; a test account (paper trading) without money is enough:',
  'Aktien über Yahoo Finance':
    'Stocks via Yahoo Finance',
  'Aktien, Indizes und Rohstoffe weltweit, sofort ohne Anmeldung. KandleOS fragt die Kurse alle 15 Sekunden bei Yahoo ab; je nach Börse sind sie verzögert (meist 15 Minuten).':
    'Stocks, indices and commodities worldwide, right away without sign-up. KandleOS polls prices from Yahoo every 15 seconds; depending on the exchange they are delayed (usually 15 minutes).',
  'Bitte beide Alpaca-Keys eintragen.':
    'Please enter both Alpaca keys.',
  'Beide Alpaca-Keys eintragen oder eine andere Quelle wählen.':
    'Enter both Alpaca keys or choose another source.',
  'Bitte bestätigen, dass du Yahoo Finance nur privat nutzt.':
    'Please confirm that you use Yahoo Finance for private purposes only.',
  'Mit Key laufen US-Aktien in Echtzeit mit, auch vor- und nachbörslich. Ohne Key werden die Kurse alle 5 s (Alpaca) oder 15 s (Yahoo) abgefragt. Für andere Börsen, Indizes und Krypto ändert sich nichts. Kostenloser Key:':
    'With a key, US stocks update in real time, including pre- and after-market. Without a key, prices are polled every 5 s (Alpaca) or 15 s (Yahoo). Nothing changes for other exchanges, indices and crypto. Free key:',
  'Der Key wird verschlüsselt auf diesem Rechner gespeichert (unter Linux nur mit gnome-keyring oder KWallet). Für einen anderen Rechner unten bei „Daten sichern“ mitexportieren oder dort neu eintragen.':
    'The key is stored encrypted on this computer (on Linux only with gnome-keyring or KWallet). For another computer, include it under “Back up data” below or enter it there again.',
  'Der Finnhub-Key darf nur Buchstaben und Ziffern enthalten.':
    'The Finnhub key may only contain letters and digits.',
  'Die Keys werden verschlüsselt auf diesem Rechner gespeichert (unter Linux nur mit gnome-keyring oder KWallet).':
    'The keys are stored encrypted on this computer (on Linux only with gnome-keyring or KWallet).',
  'Kryptokurse von Binance, ohne Anmeldung. Aktien lassen sich jederzeit dazunehmen.':
    'Crypto prices from Binance, no sign-up. Stocks can be added at any time.',
  'Yahoo Finance – Aktienkurse, Symbolsuche, Namen und Unternehmensinfos, nur wenn als Datenquelle gewählt (Nutzung nur für private Zwecke)':
    'Yahoo Finance – stock prices, symbol search, names and company info, only if chosen as the data source (for private use only)',
  'Finnhub – Echtzeit-Aktienkurse und Unternehmensinfos, nur wenn ein eigener API-Key eingetragen ist':
    'Finnhub – real-time stock prices and company info, only if you enter your own API key',
  'Infos gibt es nur für Aktien.':
    'Info is only available for stocks.',
  'Finnhub hat keine Infos zu {symbol}.':
    'Finnhub has no info on {symbol}.',
  'Für Infos einen Finnhub-Key eintragen oder Yahoo Finance einschalten (Einstellungen).':
    'For info, enter a Finnhub key or switch on Yahoo Finance (settings).',
  'Yahoo hat keine Infos zu {symbol}.':
    'Yahoo has no info on {symbol}.',
  'Infos zum Unternehmen':
    'Company info',
  'Marktkapitalisierung':
    'Market cap',
  'Branche':
    'Sector',
  'Land':
    'Country',
  'Börse':
    'Exchange',
  'Mitarbeiter':
    'Employees',
  'KGV':
    'P/E ratio',
  'Dividendenrendite':
    'Dividend yield',
  'Beta':
    'Beta',
  '52-Wochen-Spanne':
    '52-week range',
  'Börsengang':
    'IPO',
  'Lade Infos …':
    'Loading info …',
  'Website':
    'Website',
  'Beschreibung (auf Englisch)':
    'Description',
  'Quelle: {source}':
    'Source: {source}',
  'nur für private Zwecke':
    'for private use only',
  'Das Passwort muss mindestens {n} Zeichen haben.':
    'The password must have at least {n} characters.',
  'Falsches Passwort':
    'Wrong password',
  'Keine gültige KandleOS-Sicherung':
    'Not a valid KandleOS backup',
  'Daten exportieren':
    'Export data',
  'Daten importieren':
    'Import data',
  'Keine Sicherung ausgewählt':
    'No backup selected',
  'Daten sichern':
    'Back up data',
  'Watchlist, Zeichnungen, Indikatoren, Chart-Tabs, Einstellungen und gespeicherte Analysen als Datei sichern, z. B. für einen neuen Rechner.':
    'Save the watchlist, drawings, indicators, chart tabs, settings and saved analyses to a file, e.g. for a new computer.',
  'API-Keys mitexportieren (mit Passwort verschlüsselt)':
    'Include API keys (encrypted with a password)',
  'Passwort (mind. 8 Zeichen)':
    'Password (at least 8 characters)',
  'Passwort wiederholen':
    'Repeat password',
  'Die Passwörter stimmen nicht überein.':
    'The passwords do not match.',
  'Exportieren …':
    'Export …',
  'Importieren …':
    'Import …',
  'Importieren':
    'Import',
  'Gespeichert: {path}':
    'Saved: {path}',
  'Die Sicherung stammt von einer neueren KandleOS-Version.':
    'The backup comes from a newer version of KandleOS.',
  'Sicherung vom {date} (KandleOS {version}): {symbols} Werte in der Watchlist, {analyses} gespeicherte Analysen.':
    'Backup from {date} (KandleOS {version}): {symbols} symbols in the watchlist, {analyses} saved analyses.',
  'Enthält verschlüsselte API-Keys. Passwort eingeben, um sie zu übernehmen, oder leer lassen.':
    'Contains encrypted API keys. Enter the password to import them, or leave it empty.',
  'Passwort für die API-Keys':
    'Password for the API keys',
  'Ersetzt Watchlist, Zeichnungen und Einstellungen auf diesem Rechner. KandleOS lädt danach neu.':
    'Replaces the watchlist, drawings and settings on this computer. KandleOS then reloads.',
  'Bänder kalibrieren':
    'Calibrate ranges',
  'Bereiche so breit machen, wie sie im Rückblick hätten sein müssen; der Median bleibt gleich. Mit 30 Rückblicken am verlässlichsten.':
    'Make the ranges as wide as they would have needed to be in the backtests; the median stays the same. Most reliable with 30 backtests.',
  'Braucht den Rückblick (10 oder 30).':
    'Needs the backtest (10 or 30).',
  'Bänder ×{f} kalibriert':
    'ranges calibrated ×{f}',
  'Bänder kalibriert: Die Unsicherheitsbereiche sind um den Faktor {f} gestreckt (über 1) oder gestaucht (unter 1), damit im Rückblick 80 % der echten Kurse im 80 %-Bereich lagen. Die Werte oben gelten für das unkalibrierte Modell.':
    'Ranges calibrated: the uncertainty ranges are stretched (above 1) or shrunk (below 1) by the factor {f}, so that in the backtests 80 % of the real closes lay in the 80 % range. The values above are for the uncalibrated model.',
  'Fibonacci-Erweiterung (3 Klicks: Start, Ende der Bewegung, Rücksetzer)':
    'Fibonacci extension (3 clicks: start, end of the move, pullback)',
  'Fibonacci-Fächer (2 Klicks: Start → Ende der Bewegung)':
    'Fibonacci fan (2 clicks: start → end of the move)',
  'Fibonacci-Zeitzonen (2 Klicks: Start und Länge einer Einheit)':
    'Fibonacci time zones (2 clicks: start and length of one unit)',
  'Elliott-Dreieck 0-A-B-C-D-E (6 Klicks)':
    'Elliott triangle 0-A-B-C-D-E (6 clicks)',
  'Elliott-Kombination 0-W-X-Y (4 Klicks)':
    'Elliott combination 0-W-X-Y (4 clicks)',
  'Elliott-Dreifachkombination 0-W-X-Y-X-Z (6 Klicks)':
    'Elliott triple combination 0-W-X-Y-X-Z (6 clicks)',
  'Sinuswelle (2 Klicks: Tief → nächstes Hoch oder umgekehrt)':
    'Sine wave (2 clicks: trough → next peak or the reverse)',
  'Aufklappen':
    'Expand',
  'Zuklappen':
    'Collapse',
  'Alle Ordner aufklappen':
    'Expand all folders',
  'Alle Ordner zuklappen':
    'Collapse all folders',
  'Text (1 Klick, dann tippen · Doppelklick bearbeitet)':
    'Text (1 click, then type · double-click edits)',
  'Text eingeben':
    'Enter text',
  'Gegenüber „unverändert“: Backtest mit festem Kurs, also der einfachsten Schätzung, dass der Kurs ab dem früheren Zeitpunkt gleich bleibt. Orange: Diese Schätzung lag näher, die KI-Prognose hat bei diesem Chart also womöglich nichts gebracht.':
    'Compared with "unchanged": a backtest with a fixed price, i.e. the simplest guess that the price stays the same from the earlier point on. Orange: this guess was closer, so the AI forecast may not have helped for this chart.',
  '{p} genauer als „unverändert“':
    '{p} more accurate than "unchanged"',
  '{p} ungenauer als „unverändert“':
    '{p} less accurate than "unchanged"',
  'Begriffe und Einstellungen erklärt':
    'Terms and settings explained',
  'KI-Prognose: Begriffe und Einstellungen':
    'AI forecast: terms and settings',
  'Die mittlere Prognose: Laut Modell liegt der Kurs je zur Hälfte darüber oder darunter. Im Chart die gestrichelte Linie.':
    'The middle forecast: according to the model, the price is equally likely to end up above or below it. The dashed line in the chart.',
  'Zeigt den Median als Kerzen mit der prognostizierten typischen Dochtlänge. Das ist der wahrscheinlichste Verlauf, keine echten Kursschwankungen.':
    'Shows the median as candles with the forecast typical wick length. This is the most likely path, not real price swings.',
  '50 / 80 / 90 %-Bereich':
    '50 / 80 / 90 % range',
  'Mit dieser Wahrscheinlichkeit liegt der Kurs laut Modell im jeweiligen Band. Je weiter in der Zukunft, desto breiter der Fächer.':
    'According to the model, the price lies within the band with this probability. The further into the future, the wider the fan.',
  'Kasten mit Median, Bereichen und der Wahrscheinlichkeit, dass der Kurs über dem aktuellen Kurs liegt.':
    'Box with the median, the ranges and the probability that the price ends up above the current price.',
  'Wie viele Kerzen in die Zukunft prognostiziert werden. Je weiter, desto unsicherer. Auto nimmt bis zu 64, je nach vorhandener Historie.':
    'How many candles into the future are forecast. The further, the less certain. Auto uses up to 64, depending on the available history.',
  'Das Modell prognostiziert ab bis zu 30 früheren Zeitpunkten, jeder mit mindestens 512 Kerzen Vorgeschichte, und wird mit dem echten Verlauf verglichen; dafür lädt die App bei Bedarf ältere Kerzen nach. Die Prognose erscheint sofort, die Prüfung ein paar Sekunden später. Die jüngste dieser Prognosen ist grau gepunktet im Chart. Mit 3 Rückblicken schwanken die Werte allein durch Zufall um rund ±24 Prozentpunkte, mit 30 um rund ±5.':
    'The model forecasts from up to 30 earlier points in time, each with at least 512 candles of history, and is compared with what really happened; for that the app loads older candles when needed. The forecast appears right away, the check a few seconds later. The most recent of these forecasts is dotted grey in the chart. With 3 backtests the figures swing by about ±24 percentage points by chance alone, with 30 by about ±5.',
  'Streckt oder staucht die Bereiche so, dass im Rückblick 80 % der echten Kurse im 80 %-Bereich lagen. Der Median bleibt gleich.':
    'Widens or narrows the ranges so that in the backtest 80 % of the real prices lay within the 80 % range. The median stays the same.',
  'Rechnet die Prognose neu, sobald eine neue Kerze beginnt. Die Prüfung von vorher bleibt dabei stehen.':
    'Recalculates the forecast as soon as a new candle starts. The earlier check stays in place.',
  'Werte im Rückblick':
    'Backtest values',
  'Ø Abweichung':
    'Avg. error',
  'Mittlerer Abstand des Medians zum echten Schlusskurs, in Prozent des Kurses.':
    'Average distance of the median from the real close, as a percentage of the price.',
  'Im 80 %-Bereich':
    'In 80 % range',
  'Anteil der echten Kurse innerhalb des 80 %-Fächers. Gut sind etwa 80 %; deutlich weniger heißt, die Bereiche sind zu schmal, deutlich mehr, sie sind zu breit.':
    'Share of real prices within the 80 % fan. About 80 % is good; clearly less means the ranges are too narrow, clearly more that they are too wide.',
  'Richtung':
    'Direction',
  'Wie oft der Median am Ende richtig über oder unter dem Startkurs lag. Etwa die Hälfte entspricht dem Zufall.':
    'How often the median correctly ended above or below the start price. About half is what chance would give.',
  'Gegenüber „unverändert“':
    'Compared with "unchanged"',
  'Backtest mit festem Kurs: Ab einem früheren Zeitpunkt wird die KI-Prognose mit der einfachsten Schätzung verglichen, dass der Kurs gleich bleibt. Beispiel: Stand der Kurs damals bei 100 €, lautet die einfache Schätzung für jede folgende Kerze 100 €. Orange: Die einfache Schätzung lag näher am echten Verlauf, die KI-Prognose hat bei diesem Chart also womöglich nichts gebracht. Ohne Farbe: Die KI lag näher, das macht sie aber noch nicht verlässlich.':
    'Backtest with a fixed price: from an earlier point in time, the AI forecast is compared with the simplest guess, that the price stays the same. Example: if the price was 100 back then, the simple guess for every following candle is 100. Orange: the simple guess was closer to what really happened, so the AI forecast may not have helped for this chart. No color: the AI was closer, but that alone does not make it reliable.',
  'Bänder ×… kalibriert':
    'Ranges calibrated ×…',
  'Faktor, um den die Bereiche gestreckt (über 1) oder gestaucht (unter 1) wurden. Die übrigen Rückblick-Werte gelten für das unkalibrierte Modell.':
    'Factor by which the ranges were widened (above 1) or narrowed (below 1). The other backtest values apply to the uncalibrated model.',
  'Grenzen':
    'Limits',
  'Was das Modell weiß':
    'What the model knows',
  'Chronos-2 kennt nur den Kursverlauf, keine Nachrichten, Zahlen oder Stimmung. Bei Kursen schlägt es die Annahme „unverändert“ oft nur knapp oder gar nicht, besonders bei Krypto. Vergangene Treffsicherheit ist keine Garantie, und die Prognose ist keine Anlageberatung.':
    'Chronos-2 only knows the price history, not news, figures or sentiment. With prices it often beats the assumption "unchanged" only narrowly or not at all, especially for crypto. Past accuracy is no guarantee, and the forecast is not investment advice.',
  'Fazit: eher steigend':
    'Summary: leaning up',
  'Fazit: eher fallend':
    'Summary: leaning down',
  'Fazit: keine klare Richtung':
    'Summary: no clear direction',
  'In {n} Kerzen (bis {date}) liegt der Kurs laut KI mit 80 % Wahrscheinlichkeit zwischen {lo} und {hi} ({from} bis {to}).':
    'In {n} candles (by {date}) the AI puts the price between {lo} and {hi} ({from} to {to}) with 80 % probability.',
  'Wahrscheinlichkeit für einen höheren Kurs: {p}':
    'Probability of a higher price: {p}',
  'Im Rückblick war „Kurs bleibt gleich“ genauer. Diese Prognose mit Vorsicht betrachten.':
    'In the backtest, "price stays the same" was more accurate. Treat this forecast with caution.',
  'Fazit':
    'Summary',
  'Die Prognose in Worten, neben dem Knopf: Richtung, Spanne des 80 %-Bereichs am Ende und Wahrscheinlichkeit für einen höheren Kurs. „Eher steigend“ über 60 %, „eher fallend“ unter 40 %, dazwischen „keine klare Richtung“. Ein Klick auf die Überschrift klappt die Karte auf.':
    'The forecast in words, next to the button: direction, the 80 % range at the end and the probability of a higher price. "Leaning up" above 60 %, "leaning down" below 40 %, in between "no clear direction". Clicking the headline opens the card.',
  'Was bedeutet das?': 'What does this mean?',
  'Chart-Stände': 'Saved charts',
  'Charts': 'Charts',
  'Ungespeicherte Änderungen': 'Unsaved changes',
  'überschreibt „{name}“': 'overwrites “{name}”',
  'Speichern unter …': 'Save as …',
  '„{name}“ für {symbol} überschreiben?': 'Overwrite “{name}” for {symbol}?',
  'Chart-Stand speichern': 'Save chart',
  'Name': 'Name',
  'Gespeichert wird': 'What gets saved',
  'Kerzengröße {tf}': 'Candle size {tf}',
  '{count} Zeichnungen': '{count} drawings',
  'Keine Zeichnungen': 'No drawings',
  'Ungespeicherte Änderungen an „{name}“ verwerfen?': 'Discard unsaved changes to “{name}”?',
  'Alle {max} Tabs sind belegt. Die Zeichnungen im aktuellen Tab werden durch „{name}“ ersetzt. Fortfahren?': 'All {max} tabs are in use. The drawings in the current tab will be replaced by “{name}”. Continue?',
  'Noch keine Chart-Stände – „Speichern unter …“ legt den ersten an.': 'No saved charts yet – “Save as …” creates the first one.',
  'Suchen (Name oder Wert) …': 'Search (name or symbol) …',
  'Keine Treffer': 'No matches',
  '{name} · aktueller Wert': '{name} · current symbol',
  '{name} laden': 'Load {name}',
  '{tf} · {count} Zeichnungen · {date}': '{tf} · {count} drawings · {date}',
  'Chart-Stand „{name}“ löschen?': 'Delete saved chart “{name}”?',
  'Löschen': 'Delete',
  'Gespeichert {date}': 'Saved {date}',
  'Ungespeicherte Änderungen im Tab': 'Unsaved changes in the tab',
  'Für {symbol} gibt es schon einen Chart-Stand „{name}“.': 'There is already a saved chart “{name}” for {symbol}.',
  'Farbe': 'Color',
  'Standard': 'Default',
  'Weiß': 'White',
  'Rot': 'Red',
  'Orange': 'Orange',
  'Gelb': 'Yellow',
  'Grün': 'Green',
  'Blau': 'Blue',
  'Violett': 'Purple',
  'Textgröße': 'Text size',
  'Neue Version auf GitHub herunterladen': 'Download the new version from GitHub',
  'Update': 'Update',
  'Updates': 'Updates',
  'Einmal täglich bei GitHub nachsehen, ob es eine neue Version gibt. GitHub sieht dabei deine IP-Adresse; heruntergeladen oder installiert wird nichts automatisch.': 'Check GitHub once a day for a new version. GitHub sees your IP address; nothing is downloaded or installed automatically.',
  'Nach Updates suchen': 'Check for updates',
  'Frage GitHub …': 'Asking GitHub …',
  'GitHub war nicht erreichbar.': 'Could not reach GitHub.',
  'Version {v} ist verfügbar:': 'Version {v} is available:',
  'herunterladen': 'download',
  'Du hast die neueste Version.': 'You have the latest version.',
  'GitHub – Suche nach neuen Versionen, nur wenn in den Einstellungen eingeschaltet (1× täglich) oder per Klick auf „Nach Updates suchen“': 'GitHub – checking for new versions, only when turned on in the settings (once a day) or when you click “Check for updates”',
  'Installiert: {v}': 'Installed: {v}',
  'Ungültiger Zeitpunkt': 'Invalid time',
  'Lade ältere Kerzen …': 'Loading older candles…',
  'Keine älteren Daten': 'No older data',
  'Grenze von 10.000 Kerzen erreicht': 'Limit of 10,000 candles reached',
  'Ältere Kerzen konnten nicht geladen werden': 'Could not load older candles',
  'Zeichnungen seit dem Speichern gehen verloren. „{name}“ wieder laden?': 'Drawings made since saving will be lost. Load “{name}” again?',
  'Chance': 'Chance',
  'Schluss': 'Close',
  'prüfe {n} frühere Prognosen …': 'checking {n} earlier forecasts …',
  'lade Historie für die Prüfung …': 'loading history for the check …',
  'Bänder werden kalibriert …': 'calibrating ranges …',
  'Prognosen archivieren': 'Archive forecasts',
  'Speichert jede Prognose lokal und vergleicht sie später mit dem echten Kurs.': 'Keeps every forecast on this computer and later compares it with the real price.',
  'Jede angezeigte Prognose wird lokal gespeichert (höchstens eine je Kerze) und nach Ablauf ihres Zeitraums mit dem echten Kurs verglichen. Daraus entsteht die Bilanz – eine Prüfung, die nicht auf Rückrechnung beruht.': 'Every forecast shown is stored on this computer (at most one per candle) and compared with the real price once its period is over. That builds the record – a check that does not rely on looking back.',
  'Kalibrierung geprüft': 'Calibration checked',
  'Ehrliche Prüfung der Kalibrierung: Der Faktor wird nur aus der älteren Hälfte der Rückblicke berechnet und an der jüngeren Hälfte getestet. Erst ab 10 Rückblicken.': 'An honest check of the calibration: the factor is computed from the older half of the backtests only and tested on the newer half. From 10 backtests on.',
  'Stimmt „Chance ↑“?': 'Does “Chance ↑” hold?',
  'Sagte die KI zum Beispiel 70 % Chance auf einen höheren Kurs, sollte der Kurs in etwa 70 % solcher Fälle auch gestiegen sein. Unter 5 Fällen steht „zu wenige“.': 'If the AI gave, say, a 70 % chance of a higher price, the price should have risen in about 70 % of such cases. Below 5 cases it reads “too few”.',
  'Bilanz / unabhängig': 'Record / independent',
  'Abgerechnete Prognosen aus dem Archiv. Unabhängig sind die, deren Zeiträume sich nicht überschneiden – nur sie zählen als eigene Belege. Unter 10 unabhängigen ist die Bilanz ein erster Eindruck.': 'Settled forecasts from the archive. Independent are those whose periods do not overlap – only they count as separate evidence. Below 10 independent ones the record is a first impression.',
  'Bilanz deiner Prognosen:': 'Record of your forecasts:',
  '{n} abgerechnet, {k} unabhängig · im 80 %-Bereich {p}': '{n} settled, {k} independent · in 80 % range {p}',
  'noch keine abgerechnet': 'none settled yet',
  'Details …': 'Details …',
  'Alle archivierten Prognosen und die Bilanz löschen?': 'Delete all archived forecasts and the record?',
  'Archiv löschen': 'Clear archive',
  'Soll: {p}': 'Target: {p}',
  'unter 40 %': 'below 40 %',
  '40–60 %': '40–60 %',
  'über 60 %': 'above 60 %',
  'KI sagte': 'AI said',
  'Ø Chance': 'avg. chance',
  'Kurs stieg': 'price rose',
  'Fälle': 'cases',
  'zu wenige': 'too few',
  'Prüfe frühere Prognosen …': 'Checking earlier forecasts …',
  '{n} frühere Prognosen über je {steps} Kerzen, jede mit dem echten Verlauf danach verglichen.': '{n} earlier forecasts of {steps} candles each, every one compared with what really followed.',
  'Wie oft lag der echte Kurs im Bereich?': 'How often was the real price inside the range?',
  '80 %-Bereich an den jüngeren {n} Rückblicken: ohne Kalibrierung {raw}, kalibriert {calibrated} (Faktor {f}, nur aus den älteren berechnet).': '80 % range on the newer {n} backtests: uncalibrated {raw}, calibrated {calibrated} (factor {f}, computed from the older ones only).',
  'Wird ab 10 Rückblicken geprüft.': 'Checked from 10 backtests on.',
  'Genauigkeit': 'Accuracy',
  'Ø Abweichung {error} · Richtung {hits}/{runs} richtig': 'avg. error {error} · direction {hits}/{runs} right',
  'Noch keine Prognose für {label} abgerechnet. Das geschieht, sobald ihr Zeitraum vorbei ist – beim Öffnen des Werts oder beim App-Start.': 'No forecast for {label} settled yet. That happens once its period is over – when the symbol is opened or the app starts.',
  'Archivieren ist ausgeschaltet (Prognose-Einstellungen).': 'Archiving is switched off (forecast settings).',
  '{n} deiner Prognosen abgerechnet, davon {k} unabhängig (Zeiträume ohne Überschneidung).': '{n} of your forecasts settled, {k} of them independent (periods without overlap).',
  'Noch zu wenige für eine sichere Aussage.': 'Still too few for a firm conclusion.',
  'Wie oft lag der echte Kurs im Bereich (wie angezeigt)?': 'How often was the real price inside the range (as shown)?',
  'Ohne Kalibrierung: 80 %-Bereich {p}': 'Uncalibrated: 80 % range {p}',
  'Ø Abweichung {error} · Richtung {p} richtig': 'avg. error {error} · direction {p} right',
  'Prognose-Qualität': 'Forecast quality',
  'Bilanz': 'Record',
  'Erst eine KI-Prognose berechnen.': 'Compute an AI forecast first.',
  '{n} Schritte': '{n} steps',
  'zu wenig Tageshistorie für eine Prognose': 'too little daily history for a forecast',
  'Tageskurse ließen sich nicht laden': 'daily prices could not be loaded',
  'das Prognosemodell lief nicht': 'the forecast model did not run',
  'ohne Prognosemodell gestartet': 'started without the forecast model',
  'gering': 'low',
  'mittel': 'medium',
  'hoch': 'high',
  'eher steigend': 'rather rising',
  'eher fallend': 'rather falling',
  'keine klare Richtung': 'no clear direction',
  'unter dem 90 %-Bereich': 'below the 90 % range',
  'im 90 %-Bereich': 'in the 90 % range',
  'im 80 %-Bereich': 'in the 80 % range',
  'im 50 %-Bereich': 'in the 50 % range',
  'über dem 90 %-Bereich': 'above the 90 % range',
  'Ohne Chronos-Abgleich: {reason}.': 'Without Chronos comparison: {reason}.',
  'Fester Vergleich ohne Sprachmodell: die Einschätzung der Agenten gegen die tägliche Chronos-2-Prognose, die nur der Markt-Analyst samt Rückblick gesehen hat.': 'Fixed comparison without a language model: the agents\' rating against the daily Chronos-2 forecast, which only the market analyst saw, together with its backtest.',
  'Abgleich mit Chronos-2': 'Comparison with Chronos-2',
  'Markt-Analyst nicht gewählt: Chronos ging nicht in die Analyse ein.': 'Market analyst not selected: Chronos was not part of the analysis.',
  'Markt-Analyst: Chronos {level} gewichtet – {reason}': 'Market analyst: Chronos weighted {level} – {reason}',
  'Markt-Analyst: Gewichtung nicht angegeben': 'Market analyst: weighting not stated',
  'Richtung: Chronos {trend}': 'Direction: Chronos {trend}',
  'passt zur Einschätzung': 'matches the rating',
  'widerspricht der Einschätzung': 'contradicts the rating',
  'kein klarer Vergleich': 'no clear comparison',
  'Kursziel {zone} · {p} Chance, dass der Kurs nach {n} Handelstagen darüber liegt': 'Price target {zone} · {p} chance the price is above it after {n} trading days',
  'Stop-Loss: {p} Chance, dass der Kurs am Ende des Zeitraums darunter liegt (ob er zwischendurch berührt wird, sagt Chronos nicht; der Stop stützt sich teils auf den Marktbericht)': 'Stop-loss: {p} chance the price is below it at the end of the period (Chronos cannot say whether it is touched on the way; the stop partly rests on the market report)',
  'Tages-Prognose: {runs} Rückblicke, im 80 %-Bereich {in80}': 'Daily forecast: {runs} backtests, in 80 % range {in80}',
  'Tages-Prognose ohne Rückblick (zu wenig Historie)': 'Daily forecast without backtest (too little history)',
  'Stand {date} · {pair} · Tageskerzen': 'As of {date} · {pair} · daily candles',
  'Lade Tageskurse für den Abgleich mit Chronos-2 …': 'Loading daily prices for the comparison with Chronos-2 …',
  'Tages-Prognose wird berechnet …': 'Computing the daily forecast …',
  'Für den Abgleich mit Chronos-2 wird einmalig das Prognosemodell geladen (ca. 480 MB).': 'For the comparison with Chronos-2 the forecast model is downloaded once (about 480 MB).',
  'Modell jetzt laden': 'Download model now',
  'Ohne Chronos analysieren': 'Analyze without Chronos',
  'Am Handy nicht verfügbar': 'Not available on the phone',
  'Mehr': 'More',
  'Anzeigename': 'Display name',
  'Ordner „{name}“ mit allen Werten löschen?': 'Delete folder “{name}” with all its symbols?',
  'Aktien, ETF oder Krypto suchen': 'Search stocks, ETFs or crypto',
  'Verschieben': 'Move',
  'Werkzeug wählen': 'Pick a tool',
  'Zeichenwerkzeuge': 'Drawing tools',
  'Zeichnen beenden': 'Finish drawing',
  'Zeichnen': 'Draw',
  'Punkt setzen': 'Set point',
  'Zeichnung löschen': 'Delete drawing',
  'Fadenkreuz schieben · ⊕ setzt Punkt {n} von {total}': 'Move the crosshair · ⊕ sets point {n} of {total}',
  'Lizenzdatei nicht gefunden': 'License file not found',
  'Chart teilen': 'Share chart',
  'Der Key wird verschlüsselt im Schlüsselspeicher des Handys gespeichert.': 'The key is stored encrypted in the phone’s keystore.',
  'Bitte einen Kurs eingeben (aktueller Kurs nötig).': 'Please enter a price (the current price is needed).',
  'Der Kurs liegt schon dort.': 'The price is already there.',
  'aktuell {price}': 'now {price}',
  'Kurs für den Alarm': 'Alarm price',
  'Alarm setzen': 'Set alarm',
  'Geprüft wird etwa alle 15 Minuten, auch bei geschlossener App; schneller mit „Sofort-Alarme“ in den Einstellungen.': 'Checked about every 15 minutes, even with the app closed; faster with “Instant alarms” in the settings.',
  'Noch keine Kurs-Alarme.': 'No price alarms yet.',
  'erreicht {time}': 'reached {time}',
  'nicht prüfbar: keine Kursquelle für diesen Wert': 'cannot be checked: no price source for this symbol',
  'aktiv': 'active',
  'Wieder scharf schalten': 'Arm again',
  'Alarm löschen': 'Delete alarm',
  '{name} hat {price} erreicht': '{name} reached {price}',
  'Kurs-Alarm von KandleOS': 'Price alarm from KandleOS',
  'Kurs-Alarm …': 'Price alarm …',
  'Kurs-Alarme': 'Price alarms',
  'Alarme': 'Alarms',
  'Kurs-Alarme für {symbol}': 'Price alarms for {symbol}',
  'Tab {n} von {count}': 'Tab {n} of {count}',
  Tabs: 'Tabs',
  '+ Neuer Tab': '+ New tab',
  'Lange drücken zeigt alle Tabs': 'Long-press to see all tabs',
  'Anzeige und Analyse …': 'Display and analysis …',
  Vollbild: 'Full screen',
  'Vollbild beenden': 'Exit full screen',
  '{n} Werte': '{n} symbols',
  '{n} Wert': '{n} symbol',
  KI: 'AI',
  'Sofort-Alarme': 'Instant alarms',
  'Kurs-Alarme alle 15 Sekunden prüfen statt etwa alle 15 Minuten. Solange Alarme aktiv sind, zeigt Android dafür einen Dauer-Hinweis; das kostet mehr Akku.': 'Check price alarms every 15 seconds instead of about every 15 minutes. While alarms are armed, Android shows a permanent notification for it; this uses more battery.',
  'Gespeicherter Stand, keine neuen Kurse: {error}': 'Stored data, no new prices: {error}',
  'Die Sicherung wäre größer als 50 MB (zu viele gespeicherte Analysen).': 'The backup would be larger than 50 MB (too many saved analyses).',
  'Alle löschen': 'Delete all',
  'Ansehen': 'View',
  'Zur Watchlist hinzufügen …': 'Add to watchlist …',
  'Neuer Ordner …': 'New folder …',
  'Anlegen': 'Create',
  'Keine Internetverbindung': 'No internet connection',
  'Änderungen konnten nicht gespeichert werden ({error}). Ist der Speicher des Handys voll?':
    'Changes could not be saved ({error}). Is the phone storage full?',
  'Port {port} ist belegt': 'Port {port} is in use',
  'Handy-Kopplung ist aus': 'Phone pairing is off',
  'Ungültige Adresse': 'Invalid address',
  'Beenden': 'Quit',
  'Es läuft eine Analyse. KandleOS beenden und die Analyse abbrechen?': 'An analysis is running. Quit KandleOS and cancel the analysis?',
  'Handy-Kopplung aus': 'Turn phone pairing off',
  'KandleOS läuft im Infobereich weiter': 'KandleOS keeps running in the notification area',
  'Über das Symbol im Infobereich öffnen oder beenden.': 'Open or quit it from its icon in the notification area.',
  'Handy koppeln': 'Pair a phone',
  'VPN-Adresse oder Hostname (optional, kommt mit in den QR-Code)': 'VPN address or host name (optional, goes into the QR code)',
  'zuletzt gesehen {when}': 'last seen {when}',
  '„{name}“ entkoppeln? Das Handy verliert sofort den Zugang.': 'Unpair “{name}”? The phone loses access at once.',
  'Beim Anmelden starten (im Infobereich)': 'Start at login (in the notification area)',
  'Mit Windows starten (im Infobereich)': 'Start with Windows (in the notification area)',
  'PC erreichbar': 'PC reachable',
  'PC aus': 'PC off',
  'PC nicht erreichbar, oder der Code ist abgelaufen bzw. schon benutzt. Ist das Handy im selben WLAN oder im VPN? Blockt eine Firewall am PC (z. B. Portmaster) die Verbindung?':
    'PC not reachable, or the code has expired or was already used. Is the phone on the same Wi-Fi or in the VPN? Is a firewall on the PC (e.g. Portmaster) blocking the connection?',
  'Das ist kein KandleOS-Kopplungscode.': 'This is not a KandleOS pairing code.',
  'Mit PC koppeln': 'Pair with PC',
  'Den ganzen Code mit etwas Rand in den Rahmen halten, nicht zu nah.': 'Hold the whole code inside the frame with some margin, not too close.',
  'Die App darf die Kamera nicht nutzen. In den Android-Einstellungen bei KandleOS die Kamera erlauben, oder den Code am PC kopieren und hier einfügen.':
    'The app may not use the camera. Allow the camera for KandleOS in the Android settings, or copy the code on the PC and paste it here.',
  'Kopple …': 'Pairing …',
  'Code einfügen und koppeln': 'Paste code and pair',
  'Koppeln gleicht Watchlist, Zeichnungen, Chart-Stände und Alarme mit KandleOS am PC ab und übernimmt dessen Kurs-Keys.':
    'Pairing syncs the watchlist, drawings, saved charts and alarms with KandleOS on your PC and takes over its stock data keys.',
  'KandleOS am PC öffnen; Handy und PC im selben WLAN.': 'Open KandleOS on the PC; phone and PC on the same Wi-Fi.',
  'Am PC: Einstellungen → Handy koppeln → Jetzt koppeln. Ein QR-Code erscheint.': 'On the PC: Settings → Pair a phone → Pair now. A QR code appears.',
  'Hier auf „Mit PC koppeln“ tippen und den Code scannen.': 'Tap “Pair with PC” here and scan the code.',
  'erreichbar': 'reachable',
  'PC aus · zuletzt {when}': 'PC off · last seen {when}',
  'Vom PC entkoppeln? Die vom PC übernommenen Kurs-Keys werden auf dem Handy gelöscht. Am PC das Gerät unter „Handy koppeln“ ebenfalls entfernen.':
    'Unpair from the PC? The stock data keys taken over from the PC are deleted on the phone. Remove the device under “Pair a phone” on the PC as well.',
  'Entkoppeln': 'Unpair',
  'Vom PC übernommen – Kursquelle und Keys am PC ändern.': 'Taken over from the PC – change the stock source and keys there.',
  'Tab vom Handy': 'Tab from phone',
  'Mit dem PC „{name}“ koppeln? Watchlist, Zeichnungen und Alarme werden dann mit ihm abgeglichen.':
    'Pair with the PC “{name}”? The watchlist, drawings and alarms will then sync with it.',
  'Mit „{name}“ gekoppelt.': 'Paired with “{name}”.',
  'Geprüft wird, solange KandleOS läuft – mit Handy-Kopplung auch im Infobereich. Ein gekoppeltes Handy prüft zusätzlich selbst.':
    'Checked while KandleOS runs – with phone pairing also from the notification area. A paired phone checks on its own as well.',
  '(Handy)': '(phone)',
  'Beim ersten Abgleich übernimmt das Handy die Tabs vom PC. Deine Handy-Tabs mit Zeichnungen werden als Chart-Stände „Tab vom Handy“ gespeichert.':
    'On the first sync the phone takes over the tabs from the PC. Your phone tabs with drawings are kept as saved charts “Tab from phone”.',
  'erreichbar · Abgleich fehlgeschlagen': 'reachable · sync failed',
  'Handy-Kopplung funktioniert nicht': 'Phone pairing is not working',
  'Allgemein': 'General',
  'Kursdaten': 'Market data',
  'gilt nach „Speichern“': 'applies after “Save”',
  'Windows-Firewall: KandleOS darf Verbindungen aus deinem Netz annehmen (nur Port {port}).': 'Windows firewall: KandleOS may accept connections from your network (port {port} only).',
  'Windows-Firewall einrichten': 'Set up Windows firewall',
  'Erlaubt nur KandleOS, nur Port {port} und nur Geräte aus deinem Netz – auch wenn das Netz in Windows „Öffentlich“ ist. Windows fragt dafür einmal nach Administrator-Rechten.': 'Allows only KandleOS, only port {port} and only devices on your network – even if Windows treats the network as “Public”. Windows asks once for administrator rights.',
  'Die Firewall-Regel wurde nicht angelegt (Abfrage abgebrochen?).': 'The firewall rule was not created (prompt cancelled?).',
  'Der Programmpfad enthält ungewöhnliche Zeichen; bitte die Regel von Hand anlegen.': 'The program path contains unusual characters; please create the rule by hand.',
  'Am PC: Einstellungen → Handy koppeln → Jetzt koppeln. Dann den Code hier scannen.': 'On the PC: Settings → Pair a phone → Pair now. Then scan the code here.',
  'Einen Moment …': 'One moment …',
  'Das hat nicht geklappt. Ohne diese Erlaubnis erreicht das Handy den PC meist nicht.': 'That did not work. Without this permission the phone usually cannot reach the PC.',
  'Windows fragt gleich, ob KandleOS Verbindungen aus deinem Heimnetz annehmen darf. Bitte mit „Ja“ bestätigen.': 'Windows will ask whether KandleOS may accept connections from your home network. Please confirm with “Yes”.',
  'Trotzdem weiter': 'Continue anyway',
  'Nochmal versuchen': 'Try again',
  'Weiter': 'Continue',
  'Scanne den Code mit der Kamera deines Handys – oder in der KandleOS-App: Menü ⋮ → Mit PC koppeln.': 'Scan the code with your phone\'s camera – or in the KandleOS app: menu ⋮ → Pair with PC.',
  'Gültig noch {s} s.': 'Valid for {s} s.',
  'Neuen Code anzeigen': 'Show a new code',
  'Klappt nicht?': 'Not working?',
  'Ist das Handy im selben WLAN wie dieser PC?': 'Is the phone on the same Wi-Fi as this PC?',
  'Ist die KandleOS-App auf dem Handy auf dem neuesten Stand?': 'Is the KandleOS app on the phone up to date?',
  'Auf diesem PC läuft {name}. Erlaube dort KandleOS eingehende Verbindungen im Heimnetz.': '{name} is running on this PC. Allow incoming connections on your home network for KandleOS there.',
  '„{name}“ ist gekoppelt. Watchlist, Zeichnungen und Alarme gleichen sich ab jetzt von selbst ab.': '“{name}” is paired. Watchlist, drawings and alarms now sync on their own.',
  'Watchlist, Zeichnungen und Alarme mit der KandleOS-App auf dem Handy abgleichen.': 'Sync the watchlist, drawings and alarms with the KandleOS app on your phone.',
  'Ausgeschaltet – gekoppelte Handys erreichen den PC gerade nicht.': 'Turned off – paired phones cannot reach the PC right now.',
  'Einschalten': 'Turn on',
  'Weiteres Handy koppeln': 'Pair another phone',
  'Jetzt koppeln': 'Pair now',
  'Beim Schließen des Fensters läuft KandleOS im Infobereich weiter, damit das Handy den PC erreicht.': 'When you close the window, KandleOS keeps running in the notification area so the phone can reach the PC.',
  'Erweitert': 'Advanced',
  'Handy-Kopplung eingeschaltet (verschlüsselt, nur gekoppelte Geräte, Port {port})': 'Phone pairing turned on (encrypted, paired devices only, port {port})',
  'Die Analyse ist fertig, ließ sich aber nicht laden': 'The analysis is done but could not be loaded',
  'Die Analyse am PC wurde unterbrochen': 'The analysis on the PC was interrupted',
  'Einrichten geht nur am PC: Prognose-Menü → Umfassende Analyse → Einrichten.': 'Setup is only possible on the PC: forecast menu → Comprehensive analysis → Set up.',
  'Am PC gestartet: Analyse von {symbol} läuft · {time}': 'Started on the PC: analysis of {symbol} running · {time}',
  'Vom Handy gestartet: Analyse von {symbol} läuft · {time}': 'Started from the phone: analysis of {symbol} running · {time}',
  'Die Analyse läuft auf deinem PC. Dafür das Handy mit dem PC koppeln: Menü ⋮ → „Mit PC koppeln“.':
    'The analysis runs on your PC. For that, pair the phone with the PC: menu ⋮ → “Pair with PC”.',
  'PC nicht erreichbar – die Analyse läuft auf dem PC. Gespeicherte Analysen siehst du trotzdem.': 'PC not reachable – the analysis runs on the PC. Saved analyses are still shown.',
  'Die KI-Prognose rechnet KandleOS auf deinem PC. Dafür das Handy einmal mit dem PC koppeln. Jetzt koppeln?':
    'KandleOS on your PC computes the AI forecast. For that, pair the phone with the PC once. Pair now?',
  'PC nicht erreichbar. Die KI-Prognose rechnet dein PC – ist er an und im selben WLAN oder VPN?': 'PC not reachable. Your PC computes the AI forecast – is it on and in the same Wi-Fi or VPN?',
  'Das Prognosemodell fehlt am PC. Jetzt am PC laden (ca. 480 MB)?': 'The forecast model is missing on the PC. Download it on the PC now (about 480 MB)?',
  Laden: 'Download',
  Koppeln: 'Pair',
  Verwerfen: 'Discard',
  'Neu laden': 'Reload',
  Ersetzen: 'Replace',
  Überschreiben: 'Overwrite',
  // Chart error boundary
  'Der Chart konnte nicht angezeigt werden.': 'The chart could not be shown.',
  'Erneut versuchen': 'Try again',
  // Symbol search: filter and kind of each hit
  Alle: 'All',
  Aktien: 'Stocks',
  ETFs: 'ETFs',
  ETF: 'ETF',
  Fonds: 'Fund',
  Index: 'Index',
  Future: 'Future',
  Währung: 'Currency',
  'Art der Werte': 'Kind of symbols'
}
