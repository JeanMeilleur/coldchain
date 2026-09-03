/** @type {import('next').NextConfig} */
const nextConfig = {
  // No remote image hosts: the tutorial hot-linked its logo and avatar from
  // the author's own S3 bucket, which is both a broken dependency and someone
  // else's branding. All imagery here is local or rendered inline.
};

export default nextConfig;
