#!/bin/bash
# Deploy to via pushing to a remote git repository.
#
# Add the following environment variables to your project configuration and make
# sure the public SSH key from your projects General settings page is allowed to
# push to the remote repository as well.
# * REMOTE_REPOSITORY, e.g. "git@github.com:codeship/documentation.git"
# * REMOTE_BRANCH, e.g. "production"
#
# Include in your builds via
# \curl -sSL https://raw.githubusercontent.com/codeship/scripts/master/deployments/git_push.sh | bash -s
ng build --prod
ls
cp -r dist/ testfolder/
cd dist/
git config --global user.email "thornjakobsen@gmail.com"
git config --global user.name "rcoor"
git init
git add .
git commit -m "first commit"
git remote add origin https://github.com/rcoor/DockerDeployTest.git
git push -f origin master
ls
