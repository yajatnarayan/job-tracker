const cheerio = require('cheerio');

async function scrapeJobPage(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      signal: controller.signal
    });

    if (!response.ok) {
      console.error(`Failed to fetch: ${response.status}`);
      return { url, company: null, title: null, location: null };
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    let jobInfo = {
      url,
      company: null,
      title: null,
      location: null
    };

    // Try JSON-LD structured data first (most reliable)
    const jsonLdScripts = $('script[type="application/ld+json"]');
    jsonLdScripts.each((_, script) => {
      try {
        const data = JSON.parse($(script).html());
        const jobPosting = findJobPosting(data);
        if (jobPosting) {
          jobInfo.title = jobPosting.title || jobInfo.title;
          jobInfo.company = extractCompanyName(jobPosting.hiringOrganization) || jobInfo.company;
          jobInfo.location = extractLocation(jobPosting.jobLocation) || jobInfo.location;
        }
      } catch (e) {
        // Invalid JSON, skip
      }
    });

    // Try Open Graph tags
    if (!jobInfo.title) {
      jobInfo.title = $('meta[property="og:title"]').attr('content') ||
                      $('meta[name="og:title"]').attr('content');
    }

    // Try page title
    if (!jobInfo.title) {
      jobInfo.title = $('title').text().trim();
    }

    // LinkedIn specific
    if (url.includes('linkedin.com')) {
      if (!jobInfo.title) {
        jobInfo.title = $('.top-card-layout__title').text().trim() ||
                        $('h1.topcard__title').text().trim();
      }
      if (!jobInfo.company) {
        jobInfo.company = $('.topcard__org-name-link').text().trim() ||
                          $('a.topcard__org-name-link').text().trim() ||
                          $('.top-card-layout__card a.topcard__org-name-link').text().trim();
      }
      if (!jobInfo.location) {
        jobInfo.location = $('.topcard__flavor--bullet').text().trim() ||
                           $('.top-card-layout__second-subline span').first().text().trim();
      }
    }

    // Indeed specific
    if (url.includes('indeed.com')) {
      if (!jobInfo.title) {
        jobInfo.title = $('h1.jobsearch-JobInfoHeader-title').text().trim() ||
                        $('.jobsearch-JobInfoHeader-title').text().trim();
      }
      if (!jobInfo.company) {
        jobInfo.company = $('[data-company-name="true"]').text().trim() ||
                          $('.jobsearch-InlineCompanyRating-companyHeader').text().trim();
      }
      if (!jobInfo.location) {
        jobInfo.location = $('[data-testid="job-location"]').text().trim() ||
                           $('[data-testid="inlineHeader-companyLocation"]').text().trim();
      }
    }

    // Glassdoor specific
    if (url.includes('glassdoor.com')) {
      if (!jobInfo.company) {
        jobInfo.company = $('[data-test="employer-name"]').text().trim();
      }
      if (!jobInfo.location) {
        jobInfo.location = $('[data-test="location"]').text().trim();
      }
    }

    // Siemens specific
    if (url.includes('jobs.siemens.com')) {
      // Try to extract from twigConfig JavaScript object
      const scriptContent = html;
      const jobTitleMatch = scriptContent.match(/"jobTitle"\s*:\s*"([^"]+)"/);
      const jobIdMatch = scriptContent.match(/"jobId"\s*:\s*"?(\d+)"?/);

      if (jobTitleMatch && !jobInfo.title) {
        jobInfo.title = jobTitleMatch[1];
      }

      // Set company to Siemens if not found
      if (!jobInfo.company) {
        // Look for organization in the page
        const orgMatch = scriptContent.match(/"organization"\s*:\s*"([^"]+)"/);
        if (orgMatch) {
          jobInfo.company = 'Siemens - ' + orgMatch[1];
        } else {
          jobInfo.company = 'Siemens';
        }
      }

      // Try to find location from page content
      if (!jobInfo.location) {
        // Look for location patterns in the HTML
        const locationMatch = scriptContent.match(/location['"]\s*:\s*['"]([^'"]+)['"]/i) ||
                              scriptContent.match(/"addressLocality"\s*:\s*"([^"]+)"/) ||
                              scriptContent.match(/"addressCountry"\s*:\s*"([^"]+)"/);
        if (locationMatch) {
          jobInfo.location = locationMatch[1];
        }

        // Try common Siemens location selectors
        if (!jobInfo.location) {
          const locationEl = $('.job-location').text().trim() ||
                             $('[class*="location"]').first().text().trim() ||
                             $('span:contains("Location")').next().text().trim();
          if (locationEl) {
            jobInfo.location = locationEl;
          }
        }
      }

      // Try to get title from h1 or h3 if not found
      if (!jobInfo.title) {
        jobInfo.title = $('h1').first().text().trim() ||
                        $('h3').first().text().trim();
      }
    }

    // Generic fallbacks
    if (!jobInfo.location) {
      // Look for common location patterns in meta tags
      const locationMeta = $('meta[name="geo.placename"]').attr('content') ||
                           $('meta[name="geo.region"]').attr('content') ||
                           $('meta[property="og:locality"]').attr('content');
      if (locationMeta) {
        jobInfo.location = locationMeta;
      }
    }

    // Clean up extracted data
    jobInfo.title = cleanText(jobInfo.title);
    jobInfo.company = cleanText(jobInfo.company);
    jobInfo.location = cleanText(jobInfo.location);

    return jobInfo;
  } catch (error) {
    console.error('Scraping error:', error.message);
    return { url, company: null, title: null, location: null };
  } finally {
    clearTimeout(timeoutId);
  }
}

function findJobPosting(data) {
  if (!data) return null;

  if (Array.isArray(data)) {
    for (const item of data) {
      const result = findJobPosting(item);
      if (result) return result;
    }
  } else if (typeof data === 'object') {
    if (data['@type'] === 'JobPosting') {
      return data;
    }
    if (data['@graph']) {
      return findJobPosting(data['@graph']);
    }
  }
  return null;
}

function extractCompanyName(org) {
  if (!org) return null;
  if (typeof org === 'string') return org;
  return org.name || null;
}

function extractLocation(jobLocation) {
  if (!jobLocation) return null;

  if (typeof jobLocation === 'string') return jobLocation;

  if (Array.isArray(jobLocation)) {
    jobLocation = jobLocation[0];
  }

  if (jobLocation.address) {
    const addr = jobLocation.address;
    const parts = [];
    if (addr.addressLocality) parts.push(addr.addressLocality);
    if (addr.addressRegion) parts.push(addr.addressRegion);
    if (addr.addressCountry) {
      const country = typeof addr.addressCountry === 'string'
        ? addr.addressCountry
        : addr.addressCountry.name;
      if (country) parts.push(country);
    }
    return parts.join(', ') || null;
  }

  return jobLocation.name || null;
}

function cleanText(text) {
  if (!text) return null;
  return text.replace(/\s+/g, ' ').trim() || null;
}

module.exports = { scrapeJobPage };
