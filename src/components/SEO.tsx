import React from 'react';
import { Helmet } from 'react-helmet-async';

interface SEOProps {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
}

export const SEO: React.FC<SEOProps> = ({ 
  title = "StreamAura — Professional Media Downloader & Cinema",
  description = "Download high-quality videos and music from any platform. Enjoy virtual cinema rooms, pre-order movies, and manage your media library.",
  image = "https://streamaura.site/icons/icon-512x512.png",
  url = "https://streamaura.site/"
}) => {
  const safeTitle = title || "StreamAura — Professional Media Downloader & Cinema";
  const siteTitle = safeTitle.includes("StreamAura") ? safeTitle : `${safeTitle} | StreamAura`;

  return (
    <Helmet>
      {/* Primary Meta Tags */}
      <title>{siteTitle}</title>
      <meta name="title" content={siteTitle} />
      <meta name="description" content={description || "StreamAura Cinema"} />

      {/* Open Graph / Facebook */}
      <meta property="og:type" content="website" />
      <meta property="og:url" content={url} />
      <meta property="og:title" content={siteTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={image} />

      {/* Twitter */}
      <meta property="twitter:card" content="summary_large_image" />
      <meta property="twitter:url" content={url} />
      <meta property="twitter:title" content={siteTitle} />
      <meta property="twitter:description" content={description} />
      <meta property="twitter:image" content={image} />
    </Helmet>
  );
};
