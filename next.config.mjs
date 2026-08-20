/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [{ source: "/", destination: "/pilot.html", permanent: false }];
  }
};
export default nextConfig;
