import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpModule } from '@angular/http';

import { AppComponent } from './app.component';
import { AngularFireModule } from 'angularfire2';
import { HeaderComponent } from './header/header.component';
import { FooterComponent } from './footer/footer.component';
import { TalentComponent } from './talent/talent.component';
import { TalentsPageComponent } from './talents-page/talents-page.component';

// Must export the config
export const firebaseConfig = {
  apiKey: "AIzaSyAdXqXwJSfsP_UE0MNcKA6R8h90x0WL0Gs",
  authDomain: "kitchenapp-5b8a9.firebaseapp.com",
  databaseURL: "https://kitchenapp-5b8a9.firebaseio.com",
  storageBucket: "kitchenapp-5b8a9.appspot.com"
};

@NgModule({
  declarations: [
    AppComponent,
    HeaderComponent,
    FooterComponent,
    TalentComponent,
    TalentsPageComponent
  ],
  imports: [
    BrowserModule,
    FormsModule,
    HttpModule,
    AngularFireModule.initializeApp(firebaseConfig)
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
