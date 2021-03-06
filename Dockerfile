FROM node:6.9.1
MAINTAINER Theis Jakobsen <thornjakobsen@gmail.com>
RUN useradd --user-group --create-home --shell /bin/false app

ENV APP_NAME "kitchenapp"
ENV APP_USER "app"
ENV HOME /home/$APP_USER
ENV APP_DIR $HOME/$APP_NAME

RUN npm install --global angular-cli

WORKDIR $APP_DIR
COPY package.json $APP_DIR/package.json
RUN npm install && npm cache clean
COPY . $APP_DIR
RUN chown -R $APP_USER:$APP_USER $HOME/*

USER $APP_USER

EXPOSE 4200 49152

CMD ["npm", "start", "--host=0.0.0.0"]
