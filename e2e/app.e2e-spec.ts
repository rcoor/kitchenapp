import { KitchenAppPage } from './app.po';

describe('kitchen-app App', function() {
  let page: KitchenAppPage;

  beforeEach(() => {
    page = new KitchenAppPage();
  });

  it('should display message saying app works', () => {
    page.navigateTo();
    expect(page.getParagraphText()).toEqual('app works!');
  });
});
