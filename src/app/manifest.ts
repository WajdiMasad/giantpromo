import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Giant Promotions OS",
    short_name: "Giant OS",
    description:
      "Quotes, Jobs, Sage Accounting Invoicing, Field Installer Portal & Equipment Rentals for Giant Promotions Limited.",
    start_url: "/",
    display: "standalone",
    background_color: "#090d16",
    theme_color: "#090d16",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
