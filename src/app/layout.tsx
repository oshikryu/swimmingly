import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Swimmingly - Aquatic Park Swim Planner",
  description: "Determine optimal swimming times and routes at Aquatic Park in San Francisco Bay",
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
