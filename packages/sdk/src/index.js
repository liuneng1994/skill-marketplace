export class MarketplaceClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl.replace(/\/$/u, '');
  }

  async listSkills(params = {}) {
    const url = new URL(`${this.baseUrl}/api/skills`);
    if (params.target) {
      url.searchParams.set('target', params.target);
    }
    if (params.query) {
      url.searchParams.set('q', params.query);
    }
    const response = await fetch(url);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error ?? 'Failed to list skills.');
    }
    return payload.skills;
  }

  async getSkill(slug) {
    const response = await fetch(`${this.baseUrl}/api/skills/${encodeURIComponent(slug)}`);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error ?? `Failed to load skill ${slug}.`);
    }
    return payload.skill;
  }

  async getInstallMetadata(slug, target, version) {
    const url = new URL(`${this.baseUrl}/api/skills/${encodeURIComponent(slug)}/install`);
    url.searchParams.set('target', target);
    if (version) {
      url.searchParams.set('version', version);
    }
    const response = await fetch(url);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error ?? `Failed to get install metadata for ${slug}.`);
    }
    return payload.install;
  }

  async publish(bundleDir) {
    const response = await fetch(`${this.baseUrl}/api/publish`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bundleDir }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error ?? `Failed to publish ${bundleDir}.`);
    }
    return payload.skill;
  }
}
