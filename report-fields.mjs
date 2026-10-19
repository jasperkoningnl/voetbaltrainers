export function buildReportURL({ kind = 'data', club = '', season = '', coach = '', text, source = '', page = '' }) {
    if (!text?.trim()) throw new Error('Please describe what is wrong.');
    const context = JSON.stringify({ soort: kind, club, seizoen: season, coach }).replace(/-->/g, '');
    const body = [`<!-- managerhistory-report ${context} -->`, '', text.trim(), '', source ? 'Source: ' + source : '', page ? 'Page: ' + page : ''].filter(Boolean).join('\n\n');
    const params = new URLSearchParams({ title: '[Data report] ' + ([club, season].filter(Boolean).join(' · ') || kind), body });
    const url = 'https://github.com/jasperkoningnl/voetbaltrainers/issues/new?' + params;
    if (url.length > 7500) throw new Error('Please shorten your report before continuing to GitHub.');
    return url;
}
