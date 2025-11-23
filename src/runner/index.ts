/**
 * Runner Module - Service orchestration and profiles
 */

// Version info
export { VERSION, BUILD_INFO, getVersionString, getVersionInfo } from './version';

// Profiles
export {
  ProfileName,
  Profile,
  DEV_PROFILE,
  TESTNET_PROFILE,
  MAINNET_PROFILE,
  MINIMAL_PROFILE,
  FULL_PROFILE,
  PROFILES,
  getProfile,
  listProfiles,
  mergeConfig,
  loadProfileFromArgs,
  printProfileInfo,
} from './profiles';

// Unified runner
export {
  RunnerContext,
  startRunner,
  printHelp,
} from './unified';
