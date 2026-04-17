import type { PlatformAdapter } from '@hwpx/platform';
import { HwpxApp } from '@hwpx/editor';

export function App({ platform }: { platform: PlatformAdapter }) {
  return <HwpxApp platform={platform} />;
}
