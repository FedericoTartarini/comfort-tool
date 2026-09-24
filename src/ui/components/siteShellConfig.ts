/**
 * Shared site-shell content for the frontend-only app frame.
 */
interface SiteLink {
  label: string;
  href: string;
  external?: boolean;
}

export const siteBrand = {
  title: "CBE Thermal Comfort Tool",
  eyebrow: "Center for the Built Environment",
  headerLogoSrc: "/brand-media/CBE-logo-2018.png",
  footerLogoSrc: "/brand-media/CBE-logo-2019-white.png",
  berkeleyLogoSrc: "/brand-media/ucb-logo-2024-white.png",
} as const;

export const siteHeaderLinks: SiteLink[] = [
];

export const siteFooterContactLinks: SiteLink[] = [
  {
    label: "Contact",
    href: "https://github.com/FedericoTartarini",
    external: true,
  },
];

export const siteFooterDocumentationLink: SiteLink = {
  label: "Documentation",
  href: "https://center-for-the-built-environment.gitbook.io/thermal-comfort-tool",
  external: true,
};

export const siteFooterGithubLink: SiteLink = {
  label: "GitHub",
  href: "https://github.com/FedericoTartarini/comfort-tool",
  external: true,
};

export const siteFooterSummary =
  "Open-source thermal comfort calculations and charting.";

export const siteFooterCitation =
  "Tartarini, F., Schiavon, S., Cheung, T., Hoyt, T., 2020. CBE Thermal Comfort Tool: online tool for thermal comfort calculations and visualizations. SoftwareX 12, 100563. https://doi.org/10.1016/j.softx.2020.100563";
