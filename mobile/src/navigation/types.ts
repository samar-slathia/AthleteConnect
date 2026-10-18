import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RoleId } from '../data/roles';

export type RootStackParamList = {
  Welcome: undefined;
  RoleSelection: undefined;
  RolePreview: { roleId: RoleId };
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
