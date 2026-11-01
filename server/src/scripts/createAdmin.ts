import readline from 'readline';
import { connectDatabase, disconnectDatabase } from '../config/db';
import { User } from '../models/User';
import { validatePassword, hashPassword } from '../utils/password';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ProvisionAdminParams {
  name?: string;
  email: string;
  password: string;
}

export interface ProvisionAdminResult {
  success: boolean;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    isActive: boolean;
  };
}

/**
 * Prompts for visible text interactively via readline.
 */
export async function promptText(
  question: string,
  rlInstance?: readline.Interface
): Promise<string> {
  const needsClose = !rlInstance;
  const rl =
    rlInstance ||
    readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

  return new Promise<string>((resolve) => {
    rl.question(question, (answer) => {
      if (needsClose) {
        rl.close();
      }
      resolve(answer.trim());
    });
  });
}

/**
 * Prompts for sensitive input (such as a password) without echoing characters.
 * Suppresses terminal output in interactive TTY mode.
 * Gracefully falls back to line-reading in non-TTY environments (pipes / automated runs).
 */
export async function promptHidden(
  prompt: string,
  stdin: NodeJS.ReadableStream = process.stdin,
  stdout: NodeJS.WritableStream = process.stdout
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    stdout.write(prompt);

    const isTTY = Boolean((stdin as any).isTTY && typeof (stdin as any).setRawMode === 'function');

    if (!isTTY) {
      const rl = readline.createInterface({
        input: stdin,
        terminal: false,
      });

      let resolved = false;

      rl.on('line', (line: string) => {
        if (resolved) return;
        resolved = true;
        stdout.write('\n');
        resolve(line.trim());
        rl.close();
      });

      rl.on('close', () => {
        if (resolved) return;
        resolved = true;
        stdout.write('\n');
        resolve('');
      });
      return;
    }

    const ttyStdin = stdin as NodeJS.ReadStream;
    let input = '';
    let completed = false;

    ttyStdin.setRawMode(true);
    ttyStdin.resume();
    ttyStdin.setEncoding('utf8');

    const finish = (result: string, err?: Error) => {
      if (completed) return;
      completed = true;

      try {
        ttyStdin.setRawMode(false);
      } catch {
        // Suppress errors during raw-mode tear-down
      }
      ttyStdin.pause();
      ttyStdin.removeListener('data', onData);
      stdout.write('\n');

      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    };

    const onData = (chunk: Buffer | string) => {
      const str = chunk.toString();

      for (let i = 0; i < str.length; i++) {
        const char = str[i];

        // Enter key (\r or \n)
        if (char === '\r' || char === '\n') {
          finish(input);
          return;
        }

        // Ctrl+C (\u0003)
        if (char === '\u0003') {
          finish('', new Error('Operation cancelled by user.'));
          return;
        }

        // Ctrl+D / EOF (\u0004)
        if (char === '\u0004') {
          finish(input);
          return;
        }

        // Backspace (\x08 or \x7F)
        if (char === '\x08' || char === '\x7f') {
          if (input.length > 0) {
            input = input.slice(0, -1);
          }
          continue;
        }

        // Ignore control codes
        if (char.charCodeAt(0) < 32) {
          continue;
        }

        input += char;
      }
    };

    ttyStdin.on('data', onData);
  });
}

/**
 * Creates an administrator account in MongoDB with strict validations.
 * Checks for duplicate emails (never overwrites or promotes existing accounts).
 * Hashes the password using application standard bcrypt (work factor 12).
 * Returns only safe user metadata (never passwords or hashes).
 */
export async function provisionAdminAccount(
  params: ProvisionAdminParams
): Promise<ProvisionAdminResult> {
  const { name: rawName, email: rawEmail, password } = params;

  // Validate Email
  if (!rawEmail || typeof rawEmail !== 'string') {
    throw new Error('Administrator email is required.');
  }

  const normalizedEmail = rawEmail.trim().toLowerCase();
  if (!EMAIL_REGEX.test(normalizedEmail)) {
    throw new Error('Please provide a valid email address.');
  }

  // Validate Name
  const name = (rawName || '').trim() || 'Platform Administrator';
  if (name.length < 2 || name.length > 100) {
    throw new Error('Name must be between 2 and 100 characters long.');
  }

  // Validate Password
  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    throw new Error(passwordValidation.error || 'Password does not meet security requirements.');
  }

  // Ensure no account exists with this email (prevent duplicate accounts and accidental promotions)
  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    throw new Error(
      `An account with email "${normalizedEmail}" already exists (role: ${existingUser.role}). Overwriting, promoting, or duplicating accounts is strictly prohibited.`
    );
  }

  // Hash password using application convention
  const passwordHash = await hashPassword(password);

  // Create User document with role: 'admin' and isActive: true
  const adminUser = new User({
    name,
    email: normalizedEmail,
    passwordHash,
    role: 'admin',
    isActive: true,
  });

  const savedUser = await adminUser.save();

  return {
    success: true,
    user: {
      id: savedUser._id.toString(),
      name: savedUser.name,
      email: savedUser.email,
      role: savedUser.role,
      isActive: savedUser.isActive,
    },
  };
}

/**
 * Interactive command-line runner for administrator provisioning.
 */
export async function runInteractiveAdminProvisioning(): Promise<void> {
  console.log('============================================================');
  console.log(' AthleteConnect — Administrator Account Provisioning Tool');
  console.log('============================================================');
  console.log(' This local command creates an initial administrator account.');
  console.log(' Password entry is hidden for security.');
  console.log('------------------------------------------------------------\n');

  try {
    await connectDatabase();

    const name = await promptText('Administrator Name (press Enter for "Platform Administrator"): ');
    const email = await promptText('Administrator Email: ');

    const normalizedEmail = email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      throw new Error('Invalid email address format.');
    }

    // Check early if email already exists before asking for passwords
    const duplicate = await User.findOne({ email: normalizedEmail });
    if (duplicate) {
      throw new Error(
        `An account with email "${normalizedEmail}" already exists (role: ${duplicate.role}). Provisioning aborted.`
      );
    }

    const password = await promptHidden('Administrator Password (hidden): ');
    const confirmPassword = await promptHidden('Confirm Administrator Password (hidden): ');

    if (!password) {
      throw new Error('Password cannot be empty.');
    }

    if (password !== confirmPassword) {
      throw new Error('Passwords do not match. Provisioning aborted.');
    }

    const result = await provisionAdminAccount({
      name: name || undefined,
      email: normalizedEmail,
      password,
    });

    console.log('\n------------------------------------------------------------');
    console.log('[SUCCESS] Administrator account created successfully:');
    console.log(`Email:   ${result.user.email}`);
    console.log(`Role:    ${result.user.role}`);
    console.log(`Status:  ${result.user.isActive ? 'Active' : 'Inactive'}`);
    console.log('------------------------------------------------------------');
    console.log('You can now log into the AthleteConnect Admin Dashboard.\n');
  } finally {
    await disconnectDatabase();
  }
}

// Execute when invoked directly from CLI
if (
  (typeof require !== 'undefined' && require.main === module) ||
  (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('createAdmin.ts')) ||
  (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('createAdmin.js'))
) {
  runInteractiveAdminProvisioning()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error(`\n[Admin Provisioning Error] ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    });
}
