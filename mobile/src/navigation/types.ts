import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RoleId } from '../data/roles';

export type RootStackParamList = {
  Welcome: undefined;
  RoleSelection: undefined;
  RolePreview: { roleId: RoleId };
  Register: { initialRole: RoleId };
  Login: undefined;
  Home: { initialTab?: string } | undefined;
};

export type WelcomeScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'Welcome'
>;

export type RoleSelectionScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'RoleSelection'
>;

export type RolePreviewScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'RolePreview'
>;

export type RegisterScreenNavProps = NativeStackScreenProps<
  RootStackParamList,
  'Register'
>;

export type LoginScreenNavProps = NativeStackScreenProps<
  RootStackParamList,
  'Login'
>;

export type HomeScreenNavProps = NativeStackScreenProps<
  RootStackParamList,
  'Home'
>;
