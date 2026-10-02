// Where a free account can get Pro. The app sells nothing itself, and
// Google Play lets an app like that say where Pro is bought - as plain
// words, never a link or button to the page where people pay. Play's
// payments policy FAQ, on "consumption only" apps: "developers may choose
// to provide additional information about purchasing options without
// direct links, including using language such as: ... 'Go to our website
// to upgrade your subscription to Premium'". Keep it that way: no
// onPress, no URL that opens anything, and no mention in the store listing.
// Apple doesn't allow even this in the UK, so on iOS it's null and the
// screens show nothing.
import { Platform } from 'react-native';

export const PRO_ON_WEB: string | null = Platform.OS === 'android' ? 'Get Pro on our website, roadverdict.co.uk' : null;
