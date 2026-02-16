import type { Metadata } from "next";
import "./globals.css";

const basePath = process.env.NEXT_PUBLIC_BUILD_MODE === 'static' ? '/swimmingly' : '';

export const metadata: Metadata = {
  title: "Swimmingly - Aquatic Park Swim Planner",
  description: "Determine optimal swimming times and routes at Aquatic Park in San Francisco Bay",
  icons: {
    icon: `${basePath}/icon.svg`,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
