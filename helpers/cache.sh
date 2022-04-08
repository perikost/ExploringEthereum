#!/bin/sh

# log memory stats
free -h

# free pagecache, dentries and inodes
sync; sh -c 'echo 3 >/proc/sys/vm/drop_caches' && echo ''

# log memory stats
free -h

# -S, --stdin (Write the prompt to the standard error and read the password 
# from the standard input instead of using the terminal device.)

# -c (Read commands from the command_string operand instead of from the standard input.
#  Special parameter 0 will be set from the command_name operand and the positional 
# parameters ($1, $2, etc.)  set from the remaining argument operands.