/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Les images des annonces sont servies par les portails source.
  // On ne les réhéberge pas : on se contente de les afficher via <img> distant.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.flatfox.ch" },
      { protocol: "https", hostname: "**.homegate.ch" },
      { protocol: "https", hostname: "**.immoscout24.ch" },
      { protocol: "https", hostname: "**.anibis.ch" },
      { protocol: "https", hostname: "**.appt.ch" },
    ],
  },
};

export default nextConfig;
